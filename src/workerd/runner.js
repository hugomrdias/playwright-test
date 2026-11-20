import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { asyncExitHook } from 'exit-hook'
// @ts-expect-error
import mergeOptions from 'merge-options'
import { BaseRunner } from '../base-runner.js'
import {
  AFTER_TESTS_TIMEOUT,
  createPolka,
  log,
  runTimeoutMessage,
  UsageError,
} from '../utils/index.js'
import { createStackMapper } from '../utils/stack-map.js'

const merge = mergeOptions.bind({ ignoreUndefined: true, concatArrays: true })

const EXIT_WAIT = 1000
const WRANGLER_CONFIGS = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']
/** The config of the `cf` CLI, it comes before the wrangler ones. */
const CLOUDFLARE_CONFIGS = [
  'cloudflare.config.ts',
  'cloudflare.config.mts',
  'cloudflare.config.js',
  'cloudflare.config.mjs',
]
/** Requests with it start the tests, everything else goes to the worker. */
const RUN_HEADER = 'x-playwright-test-run'
const RUNTIME_MODULE = 'playwright-test:runtime'
const ENV_MODULE = 'playwright-test:env'
/** Wrangler's, for workers without a wrangler config. */
const DEFAULT_MODULE_RULES = [
  { type: 'Text', include: ['**/*.txt', '**/*.html', '**/*.sql'] },
  { type: 'Data', include: ['**/*.bin'] },
  { type: 'CompiledWasm', include: ['**/*.wasm', '**/*.wasm?module'] },
]
/** Module rule types that become workerd modules, the others get bundled. */
const MODULE_TYPES = /** @type {Record<string, 'text' | 'data' | 'wasm'>} */ ({
  Text: 'text',
  Data: 'data',
  CompiledWasm: 'wasm',
})
const BUILTINS = new Set(builtinModules.filter((name) => !name.startsWith('_')))

/**
 * Not user actionable, what workerd prints while Miniflare starts and stops.
 */
const IGNORED_LOGS = [
  'Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set',
  'disconnected: operation canceled',
  'CODE_MOVED for unknown code block',
]

/**
 * @typedef {import('../types.js').RunnerOptions} RunnerOptions
 * @typedef {import('esbuild').Plugin} ESBuildPlugin
 */

/**
 * The first of the modules that resolves, from the project and then from here.
 *
 * @param {string} cwd
 * @param {string} id
 * @param {string} [from] - also try from this module
 */
function tryResolve(cwd, id, from) {
  const requires = [
    createRequire(path.join(cwd, 'noop.js')),
    createRequire(import.meta.url),
    ...(from ? [createRequire(from)] : []),
  ]
  for (const require of requires) {
    try {
      return require.resolve(id)
    } catch {
      // Try the next one
    }
  }
}

/**
 * The folder of a package installed in or above one of these folders. Unlike
 * `require.resolve` it finds packages that can only be imported.
 *
 * @param {string} name
 * @param {string[]} dirs
 */
function findPackage(name, dirs) {
  for (const start of dirs) {
    let dir = start
    while (true) {
      const candidate = path.join(dir, 'node_modules', name)
      if (existsSync(path.join(candidate, 'package.json'))) {
        return realpathSync(candidate)
      }
      const parent = path.dirname(dir)
      if (parent === dir) {
        break
      }
      dir = parent
    }
  }
}

/**
 * @param {string} dir - package folder
 * @returns {Promise<any>}
 */
function importPackage(dir) {
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const root = pkg.exports?.['.'] ?? pkg.exports
  const entry =
    typeof root === 'string'
      ? root
      : (root?.import ?? root?.default ?? pkg.module ?? pkg.main ?? 'index.js')
  return import(
    pathToFileURL(
      path.join(dir, typeof entry === 'string' ? entry : entry.default)
    ).href
  )
}

/**
 * @typedef {{ type: 'wrangler' | 'cloudflare', path: string }} WorkerConfig
 * @typedef {object} LoadedWorker
 * @property {{ config: Record<string, any> }} worker - the worker the tests run in
 * @property {object[]} otherWorkers - workers it has service bindings to
 * @property {string} [main] - its entry point
 * @property {Record<string, string>} define
 * @property {{ type: string, include: string[] }[]} moduleRules - how to load
 *   non-JavaScript imports, like wrangler's `rules`
 */

/**
 * What reads the project's config and Miniflare, which runs workerd. They come
 * from the project, Miniflare also from wrangler or `cf` since they ship with it.
 *
 * @param {string} cwd
 * @param {WorkerConfig | undefined} config
 */
async function loadCloudflare(cwd, config) {
  const wranglerPath = tryResolve(cwd, 'wrangler')
  if (config?.type === 'wrangler' && !wranglerPath) {
    throw new UsageError(
      'Reading the wrangler config needs wrangler, install it with `npm install -D wrangler`.'
    )
  }
  const cfDir = findPackage('cf', [cwd])
  const miniflare = await loadMiniflare([
    path.join(cwd, 'noop.js'),
    ...(wranglerPath ? [wranglerPath] : []),
    ...(cfDir ? [path.join(cfDir, 'package.json')] : []),
    import.meta.url,
  ])

  /** @type {any} */
  let cloudflareConfig
  if (config?.type === 'cloudflare') {
    const dir = findPackage('@cloudflare/config', [
      cwd,
      ...(cfDir ? [cfDir] : []),
    ])
    if (!dir) {
      throw new UsageError(
        'Reading cloudflare.config.ts needs the cf CLI, install it with `npm install -D cf`.'
      )
    }
    cloudflareConfig = await importPackage(dir)
  }

  return {
    /** @type {any} */
    wrangler:
      config?.type === 'wrangler' && wranglerPath
        ? await import(pathToFileURL(wranglerPath).href)
        : undefined,
    cloudflareConfig,
    miniflare,
  }
}

/**
 * The first Miniflare 5 that resolves from these modules. A project can have an
 * older one next to the one wrangler or cf ship with.
 *
 * @param {string[]} from - module paths or URLs to resolve from
 * @returns {Promise<any>}
 */
async function loadMiniflare(from) {
  let found = false
  for (const parent of new Set(from)) {
    let resolved
    try {
      resolved = createRequire(parent).resolve('miniflare')
    } catch {
      continue
    }
    found = true
    const miniflare = await import(pathToFileURL(resolved).href)
    if (miniflare.convertV4MiniflareOptions && miniflare.resolveLocalBindings) {
      return miniflare
    }
  }
  throw new UsageError(
    found
      ? 'The workerd mode needs Miniflare 5, update wrangler or cf.'
      : 'The workerd mode needs wrangler or cf, install one with `npm install -D wrangler`.'
  )
}

/**
 * @param {string[] | undefined} flags
 */
function withNodejsCompat(flags) {
  return [...new Set([...(flags ?? []), 'nodejs_compat'])]
}

/**
 * Node built-ins are workerd's own with `nodejs_compat`, they're only reachable
 * with the `node:` prefix. A `require` gets what Node's would, not a namespace.
 *
 * @type {ESBuildPlugin}
 */
const builtinsPlugin = {
  name: 'workerd-builtins',
  setup(build) {
    const alias = build.initialOptions.alias ?? {}
    build.onResolve({ filter: /^(node:)?[a-z_/]+$/ }, (args) => {
      // Plugins come before aliases, like the node:test shim
      if (Object.hasOwn(alias, args.path)) {
        return { path: alias[args.path] }
      }
      const name = args.path.replace(/^node:/, '')
      if (!args.path.startsWith('node:') && !BUILTINS.has(name)) {
        return
      }
      const id = `node:${name}`
      if (args.kind === 'require-call') {
        return { path: id, namespace: 'workerd-require' }
      }
      return { path: id, external: true }
    })
    build.onLoad({ filter: /.*/, namespace: 'workerd-require' }, (args) => ({
      contents: `import m from ${JSON.stringify(args.path)}\nmodule.exports = m`,
      loader: 'js',
    }))
  },
}

/**
 * The worker's default export, it starts the tests for requests with the run
 * header and passes everything else to the default export of `main`, so tests
 * reach the worker with `exports.default` from `cloudflare:workers`.
 *
 * @param {object} opts
 * @param {string | undefined} opts.main
 * @param {string} opts.token
 */
function workerEntry({ main, token }) {
  const mainImports = main
    ? `import * as __pwMain from ${JSON.stringify(main)}
export * from ${JSON.stringify(main)}`
    : 'const __pwMain = {}'

  // Imports run in order, the worker sees the env when it loads
  return `import ${JSON.stringify(ENV_MODULE)}
${mainImports}

function isRun(request) {
  return request.headers.get(${JSON.stringify(RUN_HEADER)}) === ${JSON.stringify(token)}
}

// Test runners end the run with process.exit, like in the other modes
async function run() {
  const { promise, resolve } = Promise.withResolvers()
  process.exit = (code = process.exitCode) => resolve(Number(code ?? 0))
  try {
    await import(${JSON.stringify(RUNTIME_MODULE)})
  } catch (error) {
    console.error(error)
    resolve(1)
  }
  return Response.json({ code: await promise })
}

const userDefault = __pwMain.default
let handler
if (typeof userDefault === 'function') {
  // A WorkerEntrypoint class
  handler = class extends userDefault {
    fetch(request) {
      return isRun(request) ? run() : super.fetch(request)
    }
  }
} else {
  handler = {}
  for (const [key, value] of Object.entries(userDefault ?? {})) {
    handler[key] = typeof value === 'function' ? value.bind(userDefault) : value
  }
  handler.fetch = (request, env, ctx) => {
    if (isRun(request)) {
      return run()
    }
    if (typeof userDefault?.fetch !== 'function') {
      return new Response('The worker has no fetch handler.', { status: 500 })
    }
    return userDefault.fetch(request, env, ctx)
  }
}

export default handler
`
}

/**
 * Runs the tests in workerd with Miniflare, inside the worker described by the
 * project's wrangler config. Tests and the worker's `main` are bundled into one
 * module, the way wrangler deploys it.
 */
export class WorkerdRunner extends BaseRunner {
  /**
   * @param {import('../types.js').Config} options
   * @param {string[]} [testFiles]
   */
  constructor(options, testFiles) {
    super(options, testFiles)
    this.stackMapper = createStackMapper(this.dir)
    /** @type {any} */
    this.mf = undefined
    /** @type {string | undefined} */
    this.workerName = undefined
    this.token = randomUUID()
  }

  assertOptions() {
    for (const option of /** @type {const} */ (['before', 'sw', 'extension'])) {
      if (this.options[option]) {
        throw new UsageError(`--${option} does not work in the workerd mode.`)
      }
    }
  }

  /**
   * The config of the worker, undefined without one.
   *
   * @returns {WorkerConfig | undefined}
   */
  #config() {
    /**
     * @param {string} file
     * @returns {WorkerConfig}
     */
    const toConfig = (file) => ({
      type: path.basename(file).startsWith('cloudflare.config.')
        ? 'cloudflare'
        : 'wrangler',
      path: file,
    })
    const { configPath } = this.options.workerd ?? {}
    if (configPath) {
      const file = path.resolve(this.options.cwd, configPath)
      if (!existsSync(file)) {
        throw new UsageError(`Could not find the worker config ${file}.`)
      }
      return toConfig(file)
    }
    const file = [...CLOUDFLARE_CONFIGS, ...WRANGLER_CONFIGS]
      .map((name) => path.join(this.options.cwd, name))
      .find((file) => existsSync(file))
    return file ? toConfig(file) : undefined
  }

  /**
   * The env module sets what the runner adds over the worker's `process.env`,
   * like `NODE_ENV` and what `beforeTests` sets. What it inherited from this
   * process only fills in, so the worker's own vars stay what its config says.
   */
  #envModule() {
    /** @type {Record<string, string>} */
    const runner = {}
    /** @type {Record<string, string>} */
    const inherited = {}
    for (const [key, value] of Object.entries(this.env)) {
      if (value === undefined) {
        continue
      }
      if (
        key === 'NODE_ENV' ||
        key.startsWith('PW_') ||
        process.env[key] !== value
      ) {
        runner[key] = value
      } else {
        inherited[key] = value
      }
    }
    return `const env = globalThis.process.env
for (const [key, value] of Object.entries(${JSON.stringify(inherited)})) {
  env[key] ??= value
}
Object.assign(env, ${JSON.stringify(runner)})`
  }

  /**
   * @param {string | undefined} main
   * @param {LoadedWorker} loaded
   * @param {any} miniflare
   */
  async #bundle(main, { define, moduleRules }, miniflare) {
    const outfile = path.join(this.dir, 'bundle-out.js')
    const cwd = this.options.cwd
    const envModule = this.#envModule()
    /** @type {Map<string, { type: 'text' | 'data' | 'wasm', path: string }>} */
    const modules = new Map()
    const rules = miniflare
      .compileModuleRules(
        moduleRules.filter((rule) => Object.hasOwn(MODULE_TYPES, rule.type))
      )
      .map((/** @type {any} */ rule) => ({
        ...rule,
        type: MODULE_TYPES[rule.type],
      }))
    const runtime = this.options.testRunner.compileRuntime(
      this.options,
      this.tests.map((t) => path.resolve(cwd, t).replaceAll('\\', '/'))
    )

    /** @type {ESBuildPlugin} */
    const runtimePlugin = {
      name: 'workerd-runtime',
      setup(build) {
        build.onResolve(
          { filter: /^playwright-test:(runtime|env)$/ },
          (args) => ({
            path: args.path,
            namespace: 'workerd-runtime',
          })
        )
        build.onLoad(
          { filter: /.*/, namespace: 'workerd-runtime' },
          (args) => ({
            contents: args.path === ENV_MODULE ? envModule : runtime,
            resolveDir: cwd,
            loader: 'js',
          })
        )
      },
    }

    /**
     * Imports that match a module rule stay out of the bundle and become
     * workerd modules next to it, the way wrangler deploys them.
     *
     * @type {ESBuildPlugin}
     */
    const modulesPlugin = {
      name: 'workerd-modules',
      setup(build) {
        build.onResolve(
          { filter: /\.\w+(\?module)?$/ },
          async (/** @type {any} */ args) => {
            if (args.pluginData?.workerdModule) {
              return
            }
            const rule = rules.find((/** @type {any} */ rule) =>
              miniflare.testRegExps(rule.include, args.path)
            )
            if (!rule) {
              return
            }
            const resolved = await build.resolve(
              args.path.replace(/\?module$/, ''),
              {
                kind: args.kind,
                importer: args.importer,
                resolveDir: args.resolveDir,
                pluginData: { workerdModule: true },
              }
            )
            if (resolved.errors.length > 0) {
              return { errors: resolved.errors }
            }
            const hash = createHash('sha256')
              .update(resolved.path)
              .digest('hex')
              .slice(0, 8)
            const name = `modules/${hash}-${path.basename(resolved.path)}`
            modules.set(name, { type: rule.type, path: resolved.path })
            return { path: `./${name}`, external: true }
          }
        )
      },
    }

    /** @type {import('esbuild').BuildOptions} */
    const defaults = {
      stdin: {
        contents: workerEntry({ main, token: this.token }),
        resolveDir: cwd,
        sourcefile: 'workerd-entry.js',
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      // Same as wrangler
      conditions: ['workerd', 'worker', 'browser'],
      mainFields: ['browser', 'module', 'main'],
      outfile,
      sourcemap: 'inline',
      external: ['cloudflare:*', 'workerd:*'],
      define: {
        'import.meta.env': 'globalThis.process.env',
        ...define,
      },
      plugins: [modulesPlugin, runtimePlugin, builtinsPlugin],
      logLevel: 'error',
    }
    await esbuild.build(
      merge(
        defaults,
        this.options.testRunner.buildConfig?.(this.options),
        this.options.buildConfig
      )
    )
    return { outfile, modules }
  }

  #logHandler() {
    return (
      /** @type {{ level: string, message: string }} */ { level, message }
    ) => {
      if (IGNORED_LOGS.some((ignored) => message.includes(ignored))) {
        return
      }
      const stream =
        level === 'error' || level === 'warn' ? process.stderr : process.stdout
      stream.write(`${this.#mapStack(message)}\n`)
    }
  }

  /**
   * workerd names the bundle by its path or file URL, the mapper looks for its name.
   *
   * @param {string} text
   */
  #mapStack(text) {
    // A path, a file URL or `/bundle-out.js` on Windows, workerd drops the drive
    return this.stackMapper.map(
      text.replace(/[^\s()'"]*[\\/](bundle-out\.js:\d+:\d+)/g, '$1')
    )
  }

  async #startMiniflare() {
    const config = this.#config()
    const { wrangler, cloudflareConfig, miniflare } = await loadCloudflare(
      this.options.cwd,
      config
    )

    const loaded =
      config?.type === 'cloudflare'
        ? await this.#loadCloudflareConfig(
            config.path,
            cloudflareConfig,
            miniflare
          )
        : this.#loadWranglerConfig(config?.path, wrangler, miniflare)

    const main = this.options.workerd?.main
      ? path.resolve(this.options.cwd, this.options.workerd.main)
      : loaded.main
    const { outfile, modules } = await this.#bundle(main, loaded, miniflare)
    const name = path.basename(outfile)

    /** @type {{ config: Record<string, any> }} */
    const worker = merge(loaded.worker, this.options.workerd?.miniflare)
    worker.config.compatibilityFlags = withNodejsCompat(
      worker.config.compatibilityFlags
    )
    worker.config.manifest = {
      mainModule: name,
      modulesRoot: this.dir,
      modules: {
        [name]: { type: 'esm', contents: readFileSync(outfile, 'utf8') },
        ...Object.fromEntries(
          [...modules].map(([moduleName, module]) => [
            moduleName,
            {
              type: module.type,
              contents:
                module.type === 'text'
                  ? readFileSync(module.path, 'utf8')
                  : new Uint8Array(readFileSync(module.path)),
            },
          ])
        ),
      },
    }

    this.mf = new miniflare.Miniflare({
      log: new miniflare.Log(miniflare.LogLevel.WARN),
      handleStructuredLogs: this.#logHandler(),
      workers: [worker, ...loaded.otherWorkers],
    })
    this.workerName = worker.config.name
    await this.mf.ready
  }

  /**
   * The worker of a wrangler config, or an empty one without a config, in the
   * shape Miniflare 5 takes.
   *
   * @param {string | undefined} configPath
   * @param {any} wrangler
   * @param {any} miniflare
   * @returns {LoadedWorker}
   */
  #loadWranglerConfig(configPath, wrangler, miniflare) {
    if (!configPath) {
      return {
        worker: {
          config: { name: 'playwright-test', compatibilityDate: '2026-11-01' },
        },
        otherWorkers: [],
        define: {},
        moduleRules: DEFAULT_MODULE_RULES,
      }
    }
    /** @type {{ workerOptions: Record<string, any>, main?: string, define: Record<string, string>, externalWorkers: object[] }} */
    const fromConfig = wrangler.unstable_getMiniflareWorkerOptions(
      configPath,
      this.options.workerd?.environment
    )
    // Wrangler gives Miniflare 4 options without code, the bundle replaces it
    const { workers } = miniflare.convertV4MiniflareOptions({
      workers: [
        {
          name: 'playwright-test',
          ...fromConfig.workerOptions,
          modulesRoot: this.dir,
          modules: [
            {
              type: 'ESModule',
              path: path.join(this.dir, 'bundle-out.js'),
              contents: '',
            },
          ],
        },
        ...fromConfig.externalWorkers,
      ],
    })
    const [worker, ...otherWorkers] = workers
    return {
      worker,
      otherWorkers,
      main: fromConfig.main,
      define: fromConfig.define,
      moduleRules:
        fromConfig.workerOptions.modulesRules ?? DEFAULT_MODULE_RULES,
    }
  }

  /**
   * The worker of a `cloudflare.config.ts`, the config of the `cf` CLI. It's
   * already in the shape Miniflare 5 takes.
   *
   * @param {string} configPath
   * @param {any} cloudflareConfig - the `@cloudflare/config` package
   * @param {any} miniflare
   * @returns {Promise<LoadedWorker>}
   */
  async #loadCloudflareConfig(configPath, cloudflareConfig, miniflare) {
    // Config functions get it as `ctx.mode`, like `cf dev --mode`
    const mode = this.options.workerd?.environment ?? 'test'
    const { result } = await cloudflareConfig.loadAndParseConfig(configPath, {
      isPreview: false,
      mode,
    })
    if (!result.success) {
      throw new UsageError(
        `Invalid ${path.basename(configPath)}: ${result.error.message}`
      )
    }
    if (!result.data.worker) {
      throw new UsageError(
        `${path.basename(configPath)} has no worker, define one with the worker property.`
      )
    }

    const { entrypoint, assets: _assets, env, ...config } = result.data.worker

    /** @type {Record<string, string>} */
    const localEnv = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        localEnv[key] = value
      }
    }
    return {
      worker: {
        config: {
          ...config,
          // Secrets come from the environment, nothing is remote in tests
          env: miniflare.resolveLocalBindings(env ?? {}, {
            workerName: config.name,
            localEnv,
            mode,
            remoteBindings: false,
            logger: { warn: (/** @type {string} */ m) => log.warn(m) },
          }),
        },
      },
      otherWorkers: [],
      main: entrypoint,
      define: {},
      moduleRules: DEFAULT_MODULE_RULES,
    }
  }

  /**
   * @returns {Promise<boolean>} if the tests passed
   */
  async runTests() {
    // Straight to the worker, past routing like static assets coming first
    const worker = await this.mf.getWorker(this.workerName)
    const response = await worker.fetch('http://localhost/', {
      headers: { [RUN_HEADER]: this.token },
    })
    if (!response.ok) {
      log.error(this.#mapStack(await response.text()))
      return false
    }
    const { code } = /** @type {{ code: number }} */ (await response.json())
    return code === 0
  }

  async run() {
    if (this.stopped) {
      return
    }
    asyncExitHook(this.#clean.bind(this), {
      wait: AFTER_TESTS_TIMEOUT + EXIT_WAIT,
    })

    /** @type {NodeJS.Timeout | undefined} */
    let timer
    try {
      const { server, url } = await createPolka(
        this.dir,
        this.options.cwd,
        this.options.assets
      )
      this.server = server
      this.env.PW_SERVER = url
      await this.runBeforeTests()
      if (this.stopped) {
        return
      }
      await this.#startMiniflare()

      const ms = this.options.runTimeout
      if (ms > 0) {
        timer = setTimeout(() => {
          this.stop(true, runTimeoutMessage(ms))
        }, ms)
      }
      const passed = await this.runTests()
      await this.stop(!passed, passed ? undefined : 'Tests failed.')
    } catch (/** @type {any} */ error) {
      // workerd printed why it couldn't start, the stack is Miniflare's
      const startFailed = error?.code === 'ERR_RUNTIME_FAILURE'
      // esbuild already printed what it couldn't bundle
      const bundleFailed = Array.isArray(error?.errors)
      await this.stop(
        true,
        bundleFailed
          ? 'Could not bundle the tests.'
          : error instanceof UsageError || startFailed
            ? error.message
            : error
      )
    } finally {
      clearTimeout(timer)
    }
  }

  watch() {
    throw new UsageError('--watch does not work in the workerd mode yet.')
  }

  async #clean() {
    this.stopped = true
    await this.mf?.dispose().catch(() => {
      // Nothing left to stop
    })
    await this.runAfterTests()
    this.removeFiles()
    await new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve(true))
      } else {
        resolve(true)
      }
    })
  }

  /**
   * @param {boolean} fail
   * @param {any} [msg]
   */
  async stop(fail, msg) {
    if (this.stopped) {
      return
    }
    this.stopped = true
    await this.exit(fail, msg)
  }
}
