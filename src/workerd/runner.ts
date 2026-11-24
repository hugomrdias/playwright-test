import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BuildOptions, Plugin as ESBuildPlugin } from 'esbuild'
import esbuild from 'esbuild'
import { BaseRunner } from '../base-runner.ts'
import { type FileStatus, summary } from '../node/each-file.ts'
import type { Config } from '../types.ts'
import { FileOutput } from '../utils/file-output.ts'
import { log, UsageError, withTimeout } from '../utils/index.ts'
import { createMerge } from '../utils/merge.ts'
import { startServer } from '../utils/server.ts'
import { createStackMapper } from '../utils/stack-map.ts'

const merge = createMerge({ ignoreUndefined: true, concatArrays: true })

const EXIT_WAIT = 1000
/** How long to wait for the last of the worker's output after the run. */
const OUTPUT_WAIT = 5000
/** The config of the `cf` CLI. */
const CONFIGS = [
  'cloudflare.config.ts',
  'cloudflare.config.mts',
  'cloudflare.config.js',
  'cloudflare.config.mjs',
]
/** Requests with it start the tests, everything else goes to the worker. */
const RUN_HEADER = 'x-playwright-test-run'
const RUNTIME_MODULE = 'playwright-test:runtime'
const ENV_MODULE = 'playwright-test:env'
/** With `--test-isolation process`, the entry of each file's worker */
const ENTRY = 'playwright-test:entry'
/** Imports that become workerd modules, like `cf build` makes them. */
const MODULE_TYPES = [
  [/\.(txt|html|sql)$/, 'text'],
  [/\.bin$/, 'data'],
  [/\.wasm(\?module)?$/, 'wasm'],
  // Vite's, a function that instantiates the wasm module
  [/\.wasm\?init$/, 'init'],
] as const
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
 * The folder of a package installed in or above one of these folders. Unlike
 * `require.resolve` it finds packages that can only be imported.
 */
function findPackage(name: string, dirs: string[]) {
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

/** The config of a Miniflare 5 worker */
interface WorkerConfig {
  name?: string
  compatibilityFlags?: string[]
  [option: string]: unknown
}

interface MiniflareWorker {
  config: WorkerConfig
}

/**
 * What the runner uses of Miniflare 5. It's the project's own or the one of cf,
 * so it's only known at runtime.
 */
interface MiniflareModule {
  Miniflare: new (options: {
    log: unknown
    handleStructuredLogs: (log: { level: string; message: string }) => void
    workers: MiniflareWorker[]
  }) => Miniflare
  Log: new (level: number) => unknown
  LogLevel: { WARN: number }
  resolveLocalBindings(
    env: unknown,
    options: {
      workerName?: string
      localEnv: Record<string, string>
      mode: string
      remoteBindings: boolean
      logger: { warn: (message: string) => void }
    }
  ): unknown
}

interface Miniflare {
  ready: Promise<unknown>
  getWorker(name?: string): Promise<{
    fetch(url: string, init?: RequestInit): Promise<Response>
  }>
  dispose(): Promise<void>
}

/** What the runner uses of `@cloudflare/config` */
interface CloudflareConfig {
  loadAndParseConfig(
    path: string,
    options: { isPreview: boolean; mode: string }
  ): Promise<{
    result:
      | { success: false; error: Error }
      | {
          success: true
          data: {
            worker?: WorkerConfig & {
              entrypoint?: string
              assets?: unknown
              env?: unknown
            }
          }
        }
  }>
}

/**
 * @param dir - package folder
 */
function importPackage(dir: string): Promise<unknown> {
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
 * Miniflare, which runs workerd, and `@cloudflare/config`, which reads
 * `cloudflare.config.ts`. Both come with `cf`, Miniflare can also be the
 * project's own.
 *
 * @param withConfig - if the worker has a config to read
 */
async function loadCloudflare(cwd: string, withConfig: boolean) {
  const cfDir = findPackage('cf', [cwd])
  const configDir =
    withConfig && findPackage('@cloudflare/config', [cwd, cfDir ?? cwd])
  if (withConfig && !configDir) {
    throw new UsageError(
      'Reading cloudflare.config.ts needs the cf CLI, install it with `npm install -D cf`.'
    )
  }
  return {
    miniflare: await loadMiniflare([
      path.join(cwd, 'noop.js'),
      ...(cfDir ? [path.join(cfDir, 'package.json')] : []),
      import.meta.url,
    ]),
    cloudflareConfig: (configDir
      ? await importPackage(configDir)
      : undefined) as CloudflareConfig | undefined,
  }
}

/**
 * The first Miniflare 5 that resolves from these modules. A project can have an
 * older one next to the one cf ships with.
 *
 * @param from - module paths or URLs to resolve from
 */
async function loadMiniflare(from: string[]): Promise<MiniflareModule> {
  let found = false
  for (const parent of new Set(from)) {
    let resolved: string
    try {
      resolved = createRequire(parent).resolve('miniflare')
    } catch {
      continue
    }
    found = true
    const miniflare: Partial<MiniflareModule> = await import(
      pathToFileURL(resolved).href
    )
    if (miniflare.resolveLocalBindings) {
      return miniflare as MiniflareModule
    }
  }
  throw new UsageError(
    found
      ? 'The workerd mode needs Miniflare 5, update cf.'
      : 'The workerd mode needs the cf CLI, install it with `npm install -D cf`.'
  )
}

function withNodejsCompat(flags: string[] | undefined) {
  return [...new Set([...(flags ?? []), 'nodejs_compat'])]
}

/**
 * Node built-ins are workerd's own with `nodejs_compat`, they're only reachable
 * with the `node:` prefix. A `require` gets what Node's would, not a namespace.
 */
const builtinsPlugin: ESBuildPlugin = {
  name: 'workerd-builtins',
  setup(build) {
    const alias = build.initialOptions.alias ?? {}
    build.onResolve({ filter: /^(node:)?[a-z0-9_/]+$/ }, (args) => {
      const name = args.path.replace(/^node:/, '')
      if (!args.path.startsWith('node:') && !BUILTINS.has(name)) {
        return
      }
      // Plugins come before aliases, let esbuild resolve aliased built-ins like node:test
      if (Object.hasOwn(alias, args.path)) {
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
 * What the worker logs once the tests are done.
 */
function doneLog(token: string) {
  return `playwright-test:done:${token}`
}

/**
 * The worker's default export, it starts the tests for requests with the run
 * header and passes everything else to the default export of `main`, so tests
 * reach the worker with `exports.default` from `cloudflare:workers`.
 */
function workerEntry({
  main,
  token,
  index,
}: {
  main: string | undefined
  token: string
  /** The file of the worker, with `--test-isolation process` */
  index?: number
}) {
  const suffix = index === undefined ? '' : `:${index}`
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
    await import(${JSON.stringify(RUNTIME_MODULE + suffix)})
  } catch (error) {
    console.error(error)
    resolve(1)
  }
  const code = await promise
  // Output reaches the runner after the response, this tells it all came
  console.log(${JSON.stringify(doneLog(token))})
  return Response.json({ code })
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

/** The signals the exit hook of the run handles, Miniflare keeps the others */
const EXIT_SIGNALS = ['SIGINT', 'SIGTERM'] as const

/**
 * Miniflare exits this process right away on an interrupt, before the exit
 * hook of the run can stop the tests, print what the files held back and run
 * the afterTests hook. This takes out the listeners it adds for the signals
 * of the exit hook, the run stops it itself. The others stay, like its exit
 * listener, it still stops workerd when this process exits.
 */
function withoutSignalExit<T>(start: () => T): T {
  const before = new Map(
    EXIT_SIGNALS.map((signal) => [signal, new Set(process.listeners(signal))])
  )
  try {
    return start()
  } finally {
    for (const signal of EXIT_SIGNALS) {
      for (const listener of process.listeners(signal)) {
        if (!before.get(signal)?.has(listener)) {
          process.removeListener(signal, listener)
        }
      }
    }
  }
}

/**
 * Runs the tests in workerd with Miniflare, inside the worker described by the
 * project's `cloudflare.config.ts`. Tests and the worker's entry point are
 * bundled into one module.
 */
export class WorkerdRunner extends BaseRunner {
  declare stackMapper: { reset(): void; map<T>(value: T): T }
  declare mf: Miniflare | undefined
  #disposing: Promise<void> | undefined
  declare workerName: string | undefined
  declare token: `${string}-${string}-${string}-${string}-${string}`
  declare outputDone: PromiseWithResolvers<void>
  /** With a worker per file, what they print in the order of the files */
  #output: FileOutput | undefined
  /** With a workerd per file, starts the one of a file */
  #startFile: ((index: number) => Miniflare) | undefined
  /** With a workerd per file, the ones running */
  #running: Set<Miniflare> = new Set()
  /** With a workerd per file, the ones the files that ended still stop */
  #disposals: Set<Promise<void>> = new Set()
  /** With a worker per file, the output of each one reached this process */
  #filesDone: PromiseWithResolvers<void>[] = []
  #summary: (() => void) | undefined

  constructor(options: Config, testFiles?: string[]) {
    super(options, testFiles)
    this.stackMapper = createStackMapper(this.dir)
    this.mf = undefined
    this.workerName = undefined
    this.token = randomUUID()
    this.outputDone = Promise.withResolvers()
  }

  assertOptions() {
    if (this.options.trace !== 'off') {
      throw new UsageError(
        'Tracing records the browser, it does not work with --mode workerd.'
      )
    }
    if (this.options.sw) {
      throw new UsageError('--sw does not work in the workerd mode.')
    }
  }

  /**
   * The path of the worker config, undefined without one.
   */
  #configPath() {
    const { configPath } = this.options.workerd ?? {}
    if (configPath) {
      const file = path.resolve(this.options.cwd, configPath)
      if (!existsSync(file)) {
        throw new UsageError(`Could not find the worker config ${file}.`)
      }
      return file
    }
    return CONFIGS.map((name) => path.join(this.options.cwd, name)).find(
      (file) => existsSync(file)
    )
  }

  /**
   * The env module sets what the runner adds over the worker's `process.env`,
   * like `NODE_ENV` and what `beforeTests` sets. What it inherited from this
   * process only fills in, so the worker's own vars stay what its config says.
   */
  #envModule() {
    const runner: Record<string, string> = {}
    const inherited: Record<string, string> = {}
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
   * One bundle, or with `--test-isolation process` one per file. Each one has
   * all of its code: workerd runs a module like the top level of the worker
   * even when a request imports it, so the tests can't be in chunks.
   *
   * @returns the main module of each worker and the other modules
   */
  async #bundle(main: string | undefined, isolated: boolean) {
    const cwd = this.options.cwd
    const envModule = this.#envModule()
    const token = this.token
    const modules: Map<
      string,
      { type: 'text' | 'data' | 'wasm'; path: string }
    > = new Map()
    const files = this.tests.map((t) =>
      path.resolve(cwd, t).replaceAll('\\', '/')
    )
    const runtime = (index: number | undefined) =>
      this.options.testRunner.compileRuntime(
        this.options,
        index === undefined ? files : [files[index] as string]
      )

    const runtimePlugin: ESBuildPlugin = {
      name: 'workerd-runtime',
      setup(build) {
        build.onResolve(
          {
            filter: /^playwright-test:(runtime|env|entry)(:\d+)?$/,
          },
          (args) => ({
            path: args.path,
            namespace: 'workerd-runtime',
          })
        )
        build.onLoad({ filter: /.*/, namespace: 'workerd-runtime' }, (args) => {
          const [, name, index] = /^(.*?)(?::(\d+))?$/.exec(args.path) ?? []
          const file = index === undefined ? undefined : Number(index)
          const contents =
            name === ENV_MODULE
              ? envModule
              : name === ENTRY
                ? workerEntry({ main, token, index: file })
                : runtime(file)
          return { contents, resolveDir: cwd, loader: 'js' }
        })
      },
    }

    /**
     * Text, data and wasm imports stay out of the bundle and become workerd
     * modules next to it. `.wasm?init` imports get a function around one.
     */
    const modulesPlugin: ESBuildPlugin = {
      name: 'workerd-modules',
      setup(build) {
        build.onResolve(
          { filter: /\.(txt|html|sql|bin|wasm)(\?(module|init))?$/ },
          async (args) => {
            const type = MODULE_TYPES.find(([re]) => re.test(args.path))?.[1]
            if (!type || args.pluginData?.workerdModule) {
              return
            }
            const resolved = await build.resolve(
              args.path.replace(/\?(module|init)$/, ''),
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
            if (type === 'init') {
              return { path: resolved.path, namespace: 'workerd-wasm-init' }
            }
            const hash = createHash('sha256')
              .update(resolved.path)
              .digest('hex')
              .slice(0, 8)
            const name = `modules/${hash}-${path.basename(resolved.path)}`
            modules.set(name, { type, path: resolved.path })
            return { path: `./${name}`, external: true }
          }
        )
        build.onLoad(
          { filter: /.*/, namespace: 'workerd-wasm-init' },
          (args) => ({
            contents: `import wasm from ${JSON.stringify(args.path)}
export default (imports = {}) => WebAssembly.instantiate(wasm, imports)`,
            resolveDir: path.dirname(args.path),
            loader: 'js',
          })
        )
      },
    }

    const outNames = isolated
      ? files.map((_, i) => `bundle-${i}-out.js`)
      : ['bundle-out.js']
    const output: BuildOptions = isolated
      ? {
          entryPoints: outNames.map((name, i) => ({
            in: `${ENTRY}:${i}`,
            out: name.slice(0, -3),
          })),
          outdir: this.dir,
        }
      : {
          stdin: {
            contents: workerEntry({ main, token }),
            resolveDir: cwd,
            sourcefile: 'workerd-entry.js',
          },
          outfile: path.join(this.dir, 'bundle-out.js'),
        }
    const defaults: BuildOptions = {
      ...output,
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      // Packages built for the Workers runtime
      conditions: ['workerd', 'worker', 'browser'],
      mainFields: ['browser', 'module', 'main'],
      sourcemap: 'inline',
      external: ['cloudflare:*', 'workerd:*'],
      define: { 'import.meta.env': 'globalThis.process.env' },
      plugins: [modulesPlugin, runtimePlugin, builtinsPlugin],
      logLevel: 'error',
    }
    const { metafile } = await esbuild.build({
      ...merge<BuildOptions>(
        defaults,
        this.options.testRunner.buildConfig?.(this.options),
        this.options.buildConfig
      ),
      metafile: true,
    })
    // The modules each bundle imports, a worker only gets its own
    const imports: Map<string, Set<string>> = new Map()
    for (const [file, { imports: used }] of Object.entries(
      metafile?.outputs ?? {}
    )) {
      imports.set(
        path.basename(file),
        new Set(
          used
            .filter((item) => item.external)
            .map((item) => item.path.replace(/^\.\//, ''))
        )
      )
    }
    return { outNames, modules, imports }
  }

  /**
   * @param index - the file of the workerd, with one per file
   */
  #logHandler(index?: number) {
    return ({ level, message }: { level: string; message: string }) => {
      if (message.includes(doneLog(this.token))) {
        if (index === undefined) {
          this.outputDone.resolve()
        } else {
          this.#filesDone[index]?.resolve()
        }
        return
      }
      if (IGNORED_LOGS.some((ignored) => message.includes(ignored))) {
        return
      }
      const stream =
        level === 'error' || level === 'warn' ? process.stderr : process.stdout
      const text = `${this.#mapStack(message)}\n`
      if (this.#output) {
        this.#output.write(index, () => stream.write(text))
      } else {
        stream.write(text)
      }
    }
  }

  /**
   * workerd names the bundle by its path or file URL, the mapper looks for its name.
   */
  #mapStack(text: string) {
    // A path, a file URL or `/bundle-out.js` on Windows, workerd drops the drive
    return this.stackMapper.map(
      text.replace(/[^\s()'"]*[\\/](bundle(?:-[\w-]+)?-out\.js:\d+:\d+)/g, '$1')
    )
  }

  async #startMiniflare() {
    const configPath = this.#configPath()
    const { miniflare, cloudflareConfig } = await loadCloudflare(
      this.options.cwd,
      Boolean(configPath)
    )
    // There's always a cloudflareConfig with a configPath, it throws without one
    const loaded =
      configPath && cloudflareConfig
        ? await this.#loadConfig(configPath, cloudflareConfig, miniflare)
        : {
            worker: {
              config: {
                name: 'playwright-test',
                compatibilityDate: '2026-11-01',
              },
            },
          }

    const main = this.options.workerd?.main
      ? path.resolve(this.options.cwd, this.options.workerd.main)
      : loaded.main
    const isolated = this.#isolated()
    if (isolated) {
      this.#output = new FileOutput(this.tests.length)
      this.#filesDone = this.tests.map(() => Promise.withResolvers<void>())
    }
    const { outNames, modules, imports } = await this.#bundle(main, isolated)

    const worker: MiniflareWorker = merge(
      loaded.worker,
      this.options.workerd?.miniflare
    )
    worker.config.compatibilityFlags = withNodejsCompat(
      worker.config.compatibilityFlags
    )
    const manifest = (name: string) => ({
      mainModule: name,
      modulesRoot: this.dir,
      modules: {
        [name]: {
          type: 'esm',
          contents: readFileSync(path.join(this.dir, name), 'utf8'),
        },
        ...Object.fromEntries(
          [...modules]
            .filter(
              ([moduleName]) => imports.get(name)?.has(moduleName) ?? true
            )
            .map(([moduleName, module]) => [
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
    })
    const start = (name: string, index?: number) =>
      withoutSignalExit(
        () =>
          new miniflare.Miniflare({
            log: new miniflare.Log(miniflare.LogLevel.WARN),
            handleStructuredLogs: this.#logHandler(index),
            workers: [
              {
                ...worker,
                config: { ...worker.config, manifest: manifest(name) },
              },
            ],
          })
      )
    this.workerName = worker.config.name
    if (isolated) {
      // Each file starts its own when it runs
      this.#startFile = (index) => start(outNames[index] as string, index)
      return
    }

    // Stopped while it bundled, the exit hook found nothing to stop and
    // nothing would stop it once it starts
    if (this.stopped) {
      return
    }
    this.mf = start(outNames[0] as string)
    await this.mf.ready
  }

  /**
   * The worker of a `cloudflare.config.ts`, it's already in the shape
   * Miniflare 5 takes.
   *
   * @param cloudflareConfig - the `@cloudflare/config` package
   */
  async #loadConfig(
    configPath: string,
    cloudflareConfig: CloudflareConfig,
    miniflare: MiniflareModule
  ): Promise<{ worker: MiniflareWorker; main?: string }> {
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

    // The entry point gets bundled with the tests, static assets don't work yet
    const { entrypoint, assets: _assets, env, ...config } = result.data.worker

    const localEnv: Record<string, string> = {}
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
            logger: { warn: (m: string) => log.warn(m) },
          }),
        },
      },
      main: entrypoint,
    }
  }

  /**
   * Waits for the worker's output to reach this process, it comes after the
   * response to the run.
   */
  async #outputDone(done = this.outputDone.promise) {
    let timer: NodeJS.Timeout | undefined
    await Promise.race([
      done,
      new Promise((resolve) => {
        timer = setTimeout(resolve, OUTPUT_WAIT)
      }),
    ])
    clearTimeout(timer)
  }

  /**
   * @returns if the tests passed
   */
  async runTests(): Promise<boolean> {
    if (!this.mf) {
      throw new Error('Miniflare has to start before the tests run.')
    }
    const worker = await this.mf.getWorker(this.workerName)
    const response = await worker.fetch('http://localhost/', {
      headers: { [RUN_HEADER]: this.token },
    })
    if (!response.ok) {
      log.error(this.#mapStack(await response.text()))
      return false
    }
    const { code } = (await response.json()) as { code: number }
    await this.#outputDone()
    return code === 0
  }

  /**
   * With `--test-isolation process` and more than one file: a workerd per
   * file, like the Cloudflare Vitest plugin's Miniflare per file.
   */
  #isolated() {
    return this.options.testIsolation !== 'none' && this.tests.length > 1
  }

  /**
   * Each file in a workerd of its own, at most `--test-concurrency` at once. What a file
   * prints comes out in the order of the files, then a summary of them.
   * Mocha's `bail` ends the run when a file fails, the files still running
   * are cancelled and the rest skipped.
   */
  async #runEachFile() {
    const { cwd, testConcurrency, testRunner } = this.options
    const files = this.tests
    const concurrency = Math.min(
      testConcurrency ?? Math.max(os.availableParallelism() - 1, 1),
      files.length
    )
    const { bail = false } = (testRunner.options ?? {}) as { bail?: boolean }
    const bails = testRunner.name === 'mocha' && bail
    const results: (FileStatus | undefined)[] = []
    const cancels: Set<() => void> = new Set()
    let next = 0
    let stopping = false
    let bailed = false

    const worker = async () => {
      while (!stopping && !this.stopped && next < files.length) {
        const index = next++
        const result = await this.#runFile(index, cancels)
        results[index] = result
        if (!result.passed && bails && !stopping) {
          bailed = true
          stopping = true
          for (const cancel of cancels) {
            cancel()
          }
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))

    if (this.stopped) {
      return
    }
    // Skipped by bail
    for (let i = 0; i < files.length; i++) {
      results[i] ??= { passed: false, cancelled: false }
    }
    if (bailed || next === files.length) {
      // After what the cancelled files printed, see `stop`
      this.#summary = () =>
        summary({ cwd, files }, results as FileStatus[], next)
    }
    const failed = results.some((result) => !result?.passed)
    await this.stop(failed, failed ? 'Tests failed.' : undefined)
  }

  /**
   * Run one file in a workerd of its own, it stops once the file is done
   */
  async #runFile(index: number, cancels: Set<() => void>): Promise<FileStatus> {
    const output = this.#output as FileOutput
    const cancelled = Promise.withResolvers<FileStatus>()
    const cancel = () => cancelled.resolve({ passed: false, cancelled: true })
    cancels.add(cancel)
    let mf: Miniflare | undefined
    const run = async (): Promise<FileStatus> => {
      mf = (this.#startFile as (index: number) => Miniflare)(index)
      this.#running.add(mf)
      await mf.ready
      const worker = await mf.getWorker(this.workerName)
      const response = await worker.fetch('http://localhost/', {
        headers: { [RUN_HEADER]: this.token },
      })
      if (!response.ok) {
        const text = this.#mapStack(await response.text())
        output.write(index, () => log.error(text))
        return { passed: false, cancelled: false }
      }
      const { code } = (await response.json()) as { code: number }
      await this.#outputDone(this.#filesDone[index]?.promise)
      return { passed: code === 0, cancelled: false }
    }
    const running = run()
    let result: FileStatus | undefined
    try {
      result = await Promise.race([running, cancelled.promise])
      return result
    } catch (error) {
      // Its workerd stops when the run ends
      result = { passed: false, cancelled: this.stopped }
      if (!this.stopped) {
        output.write(index, () => log.error(error))
      }
      return result
    } finally {
      cancels.delete(cancel)
      // What a cancelled file printed stays with it, `stop` prints it in
      // order after it stops all of them
      running.catch(() => {
        // The run is ending
      })
      if (!result?.cancelled) {
        output.done(index)
        if (mf) {
          this.#running.delete(mf)
          // The next file doesn't wait for it, `stopTests` does
          const disposal = mf.dispose().catch(() => {
            // Nothing left to stop
          })
          this.#disposals.add(disposal)
          disposal.finally(() => this.#disposals.delete(disposal))
        }
      }
    }
  }

  /**
   * End the run once. With a workerd per file they stop first, then what
   * the files that didn't end printed comes out, and the summary.
   */
  async stop(fail: boolean, msg?: unknown) {
    if (this.stopped) {
      return
    }
    this.stopped = true
    if (this.#output) {
      // It prints what the files held back
      await this.stopTests()
      this.#summary?.()
    }
    await this.exit(fail, msg)
  }

  async run() {
    this.handleExit()

    try {
      const { server, url } = await startServer(
        this.dir,
        this.options.cwd,
        this.options.assets
      )
      this.server = server
      this.env.PW_SERVER = url
      this.startRunTimeout()
      await this.runBeforeTests()
      if (this.stopped) {
        return
      }
      await this.#startMiniflare()
      if (this.stopped) {
        return
      }

      if (this.#output) {
        await this.#runEachFile()
        return
      }
      const passed = await this.runTests()
      await this.stop(!passed, passed ? undefined : 'Tests failed.')
    } catch (error) {
      const { code, errors } = (error ?? {}) as {
        code?: string
        errors?: unknown
      }
      // workerd printed why it couldn't start, the stack is Miniflare's
      const startFailed = code === 'ERR_RUNTIME_FAILURE'
      // esbuild already printed what it couldn't bundle
      const bundleFailed = Array.isArray(errors)
      await this.stop(
        true,
        bundleFailed
          ? 'Could not bundle the tests.'
          : error instanceof UsageError || startFailed
            ? (error as Error).message
            : error
      )
    }
  }

  watch() {
    throw new UsageError('--watch does not work in the workerd mode yet.')
  }

  cleanupWait() {
    return EXIT_WAIT
  }

  /**
   * Stop workerd, the tests can still be running on a timeout or a signal.
   * Then what the files that didn't end printed comes out in order, also
   * when a signal stops the run.
   */
  async stopTests() {
    this.#disposing ??= Promise.all([
      ...[this.mf, ...this.#running].map((mf) =>
        mf?.dispose().catch(() => {
          // Nothing left to stop
        })
      ),
      ...this.#disposals,
    ]).then(() => undefined)
    await withTimeout(this.#disposing, EXIT_WAIT)
    this.#output?.flushAll()
  }
}
