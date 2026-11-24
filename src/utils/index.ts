/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { createHash } from 'crypto'
import type {
  BuildOptions as ESBuildOptions,
  Plugin as ESBuildPlugin,
} from 'esbuild'
import esbuild from 'esbuild'
import { wasmLoader } from 'esbuild-plugin-wasm'
import fs from 'fs'
import type { Server } from 'http'
import { createRequire } from 'module'
import path from 'path'
import type { BrowserType, ConsoleMessage, JSHandle } from 'playwright-core'
import { convertPathToPattern, globSync } from 'tinyglobby'
import { fileURLToPath } from 'url'
import type { Runner } from '../runner.ts'
import * as DefaultRunners from '../test-runners.ts'
import type {
  CompilerOutput,
  RunnerEnv,
  RunnerOptions,
  TestRunner,
} from '../types.ts'
import { colors } from './colors.ts'
import { createMerge } from './merge.ts'
import { polyfillAliases } from './polyfill-aliases.ts'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const merge = createMerge({ ignoreUndefined: true, concatArrays: true })

/** A hung test shouldn't hang the run forever, long enough for any real suite. */
export const DEFAULT_RUN_TIMEOUT = 30 * 60 * 1000

/** A teardown can take a while, not forever. Tests of stuck hooks lower it. */
export const AFTER_TESTS_TIMEOUT =
  Number(process.env.PW_TEST_AFTER_TESTS_TIMEOUT) || 60_000

/** An error that only needs its message shown. */
export class UsageError extends Error {}

/**
 * Check `runTimeout` before anything starts. setTimeout fires right away for
 * anything that isn't a number and for delays over 2^31 - 1.
 */
export function assertRunTimeout(value: unknown) {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 2 ** 31 - 1
  ) {
    throw new UsageError(
      `Invalid run timeout "${value}", expected milliseconds or 0 to turn it off.`
    )
  }
}

const runners: Record<string, TestRunner> = {
  mocha: DefaultRunners.mocha,
  'node-test': DefaultRunners.nodeTest,
  none: DefaultRunners.none,
}

/**
 * The runner for these options, with the options from the config file.
 */
export function resolveTestRunner({
  runner,
  testRunner,
}: {
  runner: string
  testRunner?: Partial<TestRunner>
}): TestRunner {
  if (testRunner?.compileRuntime) {
    throw new UsageError(
      'Custom test runners are not supported, set runner to mocha, node-test or none.'
    )
  }
  if (!Object.hasOwn(runners, runner)) {
    throw new UsageError(
      `Unknown runner "${runner}", use mocha, node-test or none.`
    )
  }
  return merge(runners[runner], { options: testRunner?.options })
}

/**
 * Check what can't work before starting a browser for it.
 */
export function assertBrowserOptions({ mode, trace }: RunnerOptions) {
  if (mode !== 'browser' && mode !== 'web-worker') {
    throw new UsageError(
      `Invalid mode "${mode}", this runner takes "browser" or "web-worker".`
    )
  }
  assertTrace(trace)
}

/**
 * Removed in v16, a config that still asks for it would pass without it.
 */
export function assertNoExtension(options: object) {
  if ((options as { extension?: unknown }).extension) {
    throw new UsageError(
      'The extension option was removed in v16, remove it from the config.'
    )
  }
}

export const TRACE_VALUES = ['off', 'on', 'retain-on-failure']

export function assertTrace(trace: unknown) {
  if (!TRACE_VALUES.includes(trace as string)) {
    throw new UsageError(
      `Invalid trace "${trace}", expected "on", "off" or "retain-on-failure".`
    )
  }
}

/**
 * Wait for a promise, up to `ms`.
 *
 * @returns what it resolved to, or `fallback` when it took too long
 */
export async function withTimeout<T, F = undefined>(
  promise: Promise<T>,
  ms: number,
  fallback?: F
): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<F>((resolve) => {
        timer = setTimeout(() => resolve(fallback as F), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Close the server of the run, its open connections can make that wait.
 */
export function closeServer(server: Server | undefined, ms: number) {
  if (!server) {
    return Promise.resolve()
  }
  return withTimeout(
    new Promise<void>((resolve) => {
      server.close(() => resolve())
    }),
    ms
  )
}

const TIMED_OUT = Symbol('timed out')

/**
 * Run the after tests hook, it failing fails the run instead of the cleanup.
 *
 * @returns if it worked, it never rejects
 */
export async function runAfterTests(
  afterTests: RunnerOptions['afterTests'],
  env: RunnerEnv,
  beforeTestsOutput: unknown
): Promise<boolean> {
  try {
    const result = await withTimeout(
      Promise.resolve(afterTests(env, beforeTestsOutput)),
      AFTER_TESTS_TIMEOUT,
      TIMED_OUT
    )
    if (result === TIMED_OUT) {
      throw new Error(`It did not finish in ${AFTER_TESTS_TIMEOUT}ms.`)
    }
    return true
  } catch (error) {
    const stack = (error as { stack?: string } | undefined)?.stack
    log.error(`The afterTests hook failed.\n${stack ?? error}`)
    return false
  }
}

export function runTimeoutMessage(ms: number) {
  return `Run timed out after ${ms}ms, use --run-timeout to change it.`
}

export const defaultOptions: Omit<RunnerOptions, 'testRunner'> = {
  cwd: process.cwd(),
  assets: '',
  browser: 'chromium',
  debug: false,
  mode: 'browser', // or 'web-worker'
  input: undefined,
  runner: 'node-test',
  sw: undefined,
  extensions: 'js,cjs,mjs,ts,tsx,jsx',
  runTimeout: DEFAULT_RUN_TIMEOUT,
  trace: 'off',
  buildConfig: {},
  buildSWConfig: {},
  browserContextOptions: {},
  launchOptions: {},
  beforeTests: async () => {
    // noop
  },
  afterTests: async () => {
    // noop
  },
}

export const log = {
  info(message: string, quiet: boolean = false) {
    if (!quiet) {
      console.error(colors.blue('ℹ'), message)
    }
  },
  warn(message: string, quiet: boolean = false) {
    if (!quiet) {
      console.warn(colors.yellow('-'), message)
    }
  },
  error(message: unknown, quiet: boolean = false) {
    if (!quiet) {
      console.warn(colors.red('✘'), message)
    }
  },
}

const defaultIgnorePatterns = [
  '.git', // Git repository files, see <https://git-scm.com/>
  '.log', // Log files emitted by tools such as `tsserver`, see <https://github.com/Microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29>
  '.nyc_output', // Temporary directory where nyc stores coverage data, see <https://github.com/bcoe/nyc>
  '.sass-cache', // Cache folder for node-sass, see <https://github.com/sass/node-sass>
  'bower_components', // Where Bower packages are installed, see <http://bower.io/>
  'coverage', // Standard output directory for code coverage reports, see <https://github.com/gotwarlost/istanbul>
  'node_modules', // Where Node modules are installed, see <https://nodejs.org/>,
  '**/node_modules',
  '**/__tests__/**/__{helper,fixture}?(s)__/**/*',
  '**/test?(s)/**/{helper,fixture}?(s)/**/*',
]

function hasExtension(extensions: string[], file: string) {
  return extensions.includes(path.extname(file).slice(1))
}

function buildExtensionPattern(extensions: string[]) {
  return extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`
}

export function defaultTestPatterns(extensions: string[]) {
  const extensionPattern = buildExtensionPattern(extensions)

  return [
    `test.${extensionPattern}`,
    `{src,source}/test.${extensionPattern}`,
    `**/__tests__/**/*.${extensionPattern}`,
    `**/*.spec.${extensionPattern}`,
    `**/*.test.${extensionPattern}`,
    `**/test-*.${extensionPattern}`,
    `**/test/**/*.${extensionPattern}`,
    `**/tests/**/*.${extensionPattern}`,
  ]
}

function search(cwd: string, patterns: string[]) {
  const files = globSync(patterns, {
    absolute: false,
    caseSensitiveMatch: false,
    cwd,
    dot: false,
    expandDirectories: true,
    followSymbolicLinks: true,
    ignore: defaultIgnorePatterns,
    onlyFiles: true,
  })

  // Return absolute file paths. This has the side-effect of normalizing paths
  // on Windows.
  return files.map((file) => path.join(cwd, file))
}

/**
 * A pattern that names an existing path is that path, not a glob. Otherwise
 * Windows separators read as escapes, and so do `[id].test.js` or `(a)/b.js` as
 * glob syntax.
 */
function globFiles(cwd: string, patterns: string[]) {
  const globs: string[] = []
  const otherDrives: string[] = []

  for (const pattern of patterns) {
    const target = path.resolve(cwd, pattern)
    if (!pattern || !fs.existsSync(target)) {
      globs.push(pattern)
      continue
    }

    const relative = path.relative(cwd, target)
    if (path.isAbsolute(relative)) {
      // Another Windows drive, which a search from cwd can't get to
      otherDrives.push(
        ...search(path.dirname(target), [
          convertPathToPattern(path.basename(target)),
        ])
      )
    } else {
      // Separators first, it reads `app\[id].js` as an escape and not as a folder
      globs.push(
        convertPathToPattern(relative.replaceAll(path.sep, '/')) || '.'
      )
    }
  }

  return [...search(cwd, globs), ...otherDrives]
}

/**
 * Find the tests files
 *
 * @param options.cwd - Current working directory
 * @param options.extensions - File extensions allowed in the bundle
 * @param options.filePatterns - File patterns to search for
 */
export function findTests({
  cwd,
  extensions,
  filePatterns,
}: {
  cwd: string
  extensions: string[]
  filePatterns: string[]
}) {
  if (
    !filePatterns ||
    filePatterns.length === 0 ||
    filePatterns[0] === undefined
  ) {
    filePatterns = defaultTestPatterns(extensions)
  }
  return globFiles(cwd, filePatterns).filter(
    (file) =>
      hasExtension(extensions, file) && !path.basename(file).startsWith('_')
  )
}

/**
 * What JSON can't hold, runs in the page. Primitives like BigInt get to the handle
 * as undefined already, those can't be told apart.
 */
function describeValue(value: unknown) {
  if (
    typeof value === 'symbol' ||
    typeof value === 'function' ||
    value instanceof RegExp
  ) {
    return { text: String(value) }
  }
  if (value instanceof Map) {
    return { map: [...value] }
  }
  if (value instanceof Set) {
    return { set: [...value] }
  }
}

/**
 * Read the value of a console argument to print it.
 */
async function readConsoleArg(arg: JSHandle) {
  const value = await arg.jsonValue()
  if (value === null) {
    return value
  }
  const lossy =
    value === undefined ||
    (Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).length === 0)
  if (!lossy) {
    return value
  }

  const { text, map, set } =
    (await arg.evaluate(describeValue).catch(() => undefined)) ?? {}
  if (map) {
    return new Map(map)
  }
  if (set) {
    return new Set(set)
  }
  return text ?? value
}

const messageTypeToConsoleFn: Record<string, typeof console.log> = {
  log: console.log,
  warning: console.warn,
  error: console.error,
  info: console.info,
  assert: console.assert,
  debug: console.debug,
  trace: console.trace,
  dir: console.dir,
  dirxml: console.dirxml,
  profile: console.profile,
  profileEnd: console.profileEnd,
  startGroup: console.group,
  startGroupCollapsed: console.groupCollapsed,
  endGroup: console.groupEnd,
  table: console.table,
  count: console.count,
  timeEnd: console.log,
  timeLog: console.log,

  // we ignore calls to console.clear, as we don't want the page to clear our terminal
  // clear: console.clear
}

/**
 * Print a console message from the browser.
 */
function printConsole(
  msg: ConsoleMessage,
  msgArgs: unknown[],
  text: string,
  mapStack: <T>(value: T) => T
) {
  const type = msg.type()
  const consoleFn = messageTypeToConsoleFn[type]

  switch (type) {
    case 'endGroup': {
      // It has no arguments in Firefox and WebKit
      console.groupEnd()
      return
    }
    case 'assert': {
      // The page already checked it, and doesn't send the condition. Chromium
      // sends its name when there's no message.
      console.assert(false, ...msgArgs.filter((a) => a !== 'console.assert'))
      return
    }
    case 'count': {
      // Chromium sends what to print, Firefox only the label for us to count
      if (/: \d+$/.test(text)) {
        console.log(text)
      } else {
        console.count(text)
      }
      return
    }
    case 'trace': {
      // console.trace would print the stack of this function
      const { url, lineNumber, columnNumber } = msg.location()
      console.error(
        'Trace:',
        ...msgArgs.filter((a) => a !== 'console.trace'),
        mapStack(`\n    at ${url}:${lineNumber + 1}:${columnNumber + 1}`)
      )
      return
    }
    default:
  }

  if (msgArgs.length > 0) {
    consoleFn.apply(console, msgArgs)
  } else if (['debug', 'timeEnd', 'timeLog'].includes(type)) {
    // How WebKit sends console.count and console.timeEnd
    consoleFn.call(console, text)
  } else if (text) {
    console.error(colors.dim(`🌐${text}`))
  } else if (type === 'log') {
    // Firefox sends console.log() and the others nothing at all
    console.log()
  }
}

/**
 * Read a console message from the browser while its arguments are still there.
 * Printing is left to the caller, messages take different times to read and have
 * to come out in the order they went in.
 *
 * @param mapStack - map stack traces back to the source files
 * @returns prints the message, it never rejects
 */
export async function readConsole(
  msg: ConsoleMessage,
  mapStack: <T>(value: T) => T
): Promise<() => void> {
  const type = msg.type()
  const consoleFn = messageTypeToConsoleFn[type]

  if (!consoleFn) {
    return () => {
      // not printed
    }
  }
  const text = mapStack(msg.text())

  // skip browser informational warnings
  if (text?.includes('Clear-Site-Data')) {
    return () => {
      // not printed
    }
  }

  try {
    const msgArgs = await Promise.all(
      msg.args().map(async (arg) => mapStack(await readConsoleArg(arg)))
    )
    return () => printConsole(msg, msgArgs, text, mapStack)
  } catch {
    // Runner was probably force stopped, the page can't give us the values
    // anymore so print the text on the stream this message belongs to.
    // console.assert would print nothing, it only checks its first argument.
    const printText =
      type === 'assert' || type === 'trace' ? console.error : consoleFn
    return () => printText.call(console, text)
  }
}

/**
 * Whether this `playwright-core` package is already registered in Playwright's
 * `.links` cache directory so another Playwright version's GC won't delete it.
 */
function hasPackageLink(registryDirectory: string) {
  try {
    const packagePath = path.dirname(
      require.resolve('playwright-core/package.json')
    )
    const linkPath = path.join(
      registryDirectory,
      '.links',
      createHash('sha1').update(packagePath).digest('hex')
    )
    return fs.readFileSync(linkPath, 'utf8') === packagePath
  } catch {
    return false
  }
}

/**
 * The Playwright browser type, with the browser it launches installed.
 *
 * @param launch - what gets launched, from the launch options
 */
export async function getPw(
  browserName: RunnerOptions['browser'],
  {
    headless,
    channel,
    executablePath,
  }: { headless: boolean; channel?: string; executablePath?: string }
): Promise<BrowserType> {
  if (!['chromium', 'firefox', 'webkit'].includes(browserName)) {
    throw new Error(`Browser not supported: ${browserName}`)
  }

  const api = await import('playwright-core')
  // Their own browser, or one installed on the system like `chrome` or `msedge`
  if (executablePath || (channel && channel !== 'chromium')) {
    return api[browserName]
  }

  // The `chromium` channel is the new headless, it needs the whole browser
  const executable =
    browserName === 'chromium' && headless && !channel
      ? 'chromium-headless-shell'
      : browserName

  const {
    registry: { registry, registryDirectory },
    // @ts-expect-error
  } = await import('playwright-core/lib/coreBundle')
  const browser = registry.findExecutable(executable)
  // Validating the browser on Windows needs winldd, same as Playwright's own install.
  const executables =
    process.platform === 'win32'
      ? [registry.findExecutable('winldd'), browser]
      : [browser]

  // Skip the lockfile + GC + marker check in `registry.install` when every
  // required executable is completely installed and this package is registered
  // in `.links` (so another Playwright version's GC won't remove the browser).
  const installed =
    hasPackageLink(registryDirectory) &&
    executables.every((exe) => {
      const exePath = exe?.executablePath()
      return Boolean(
        exePath &&
          fs.existsSync(exePath) &&
          (!exe.directory ||
            fs.existsSync(path.join(exe.directory, 'INSTALLATION_COMPLETE')))
      )
    })
  if (installed) {
    return api[browserName]
  }

  // playwright will log browser download progress to stdout, temporarily
  // redirect the output to stderr
  const log = console.log
  const info = console.info

  try {
    console.log = console.error
    console.info = console.error
    await registry.install(executables)
  } finally {
    console.log = log
    console.info = info
  }
  return api[browserName]
}

export function addWorker(filePath: string) {
  return `
const w = new Worker("${filePath}", { type: "module" });
w.onmessage = function(e) {
    if(e.data.pwRunEnded) {
        self.PW_TEST.end(e.data.pwRunFailed)
    }
    if (e.data.pwStdout != null) {
        self.PW_TEST_STDOUT_WRITE(e.data.pwStdout)
    }
    if (e.data.pwStderr != null) {
        self.PW_TEST_STDERR_WRITE(e.data.pwStderr)
    }
    // Calls of playwright-test/client, the bindings are only here. Only its
    // context and page bindings, not the others of the runner.
    if (e.data.pwBindingCall) {
        const { name, args } = e.data.pwBindingCall
        const [port] = e.ports
        Promise.resolve()
            .then(() => {
                if (!/^pw(Context|Page)[A-Z]/.test(name) || typeof self.pwClientCall !== 'function') {
                    throw new Error('Unknown playwright-test/client call: ' + name)
                }
                return self.pwClientCall(name, ...args)
            })
            .then(
                (value) => port.postMessage({ value }),
                (error) => port.postMessage({ error: String(error?.message ?? error) })
            )
    }
}
`
}

/**
 * The file with the env of the run, next to the bundles. It's written once the
 * env is complete, so bundling doesn't have to wait for the server and the
 * `beforeTests` hook. Named after the run so it can't hide a file of `--assets`.
 *
 * @param dir - Runner directory
 */
export const envFile = (dir: string) => `pw-env-${path.basename(dir)}.js`

const ENV_MODULE = 'playwright-test:env'

/**
 * Write the env the bundles import from {@link envFile}, next to them.
 */
export function writeEnv(runner: Runner, env: Record<string, unknown>) {
  return fs.promises.writeFile(
    path.join(runner.files, envFile(runner.dir)),
    `export default ${JSON.stringify(env)}\n`
  )
}

const ENTRY = 'playwright-test:entry'

/**
 * The name of the bundle of one test file, see {@link build}
 */
export const bundleName = (index: number) => `bundle-${index}-out.js`

/**
 * Build the bundle, or with a template for each file one bundle per file, the
 * code they share in chunks next to them.
 *
 * @param config - Runner esbuild config
 */
export async function build(
  runner: Runner,
  config: ESBuildOptions = {},
  tmpl: string | string[] = ''
): Promise<CompilerOutput> {
  // Imports run first, so the env is there before anything the template imports
  const entry = (template: string) => `
import env from ${JSON.stringify(ENV_MODULE)}
Object.assign(process.env, env)
import.meta.env = { ...env }

${template}
`
  const templates = Array.isArray(tmpl) ? tmpl : undefined

  const envPlugin: ESBuildPlugin = {
    name: 'env',
    setup(build) {
      // Next to the bundle in the page and the worker
      build.onResolve({ filter: new RegExp(`^${ENV_MODULE}$`) }, () => ({
        path: `./${envFile(runner.dir)}`,
        external: true,
      }))
    },
  }
  /**
   * The entries of the files, they import them from `cwd` like the one entry does
   */
  const entriesPlugin: ESBuildPlugin = {
    name: 'entries',
    setup(build) {
      build.onResolve({ filter: new RegExp(`^${ENTRY}:\\d+$`) }, (args) => ({
        path: args.path,
        namespace: ENTRY,
      }))
      build.onLoad({ filter: /.*/, namespace: ENTRY }, (args) => ({
        contents: entry(
          templates?.[Number(args.path.slice(ENTRY.length + 1))] ?? ''
        ),
        resolveDir: runner.options.cwd,
        loader: 'js',
      }))
    },
  }
  const files: Set<string> = new Set()
  /**
   * Only watch mode needs the files, esbuild waits on this thread for each one.
   */
  const watchPlugin: ESBuildPlugin = {
    name: 'watcher',
    setup(build) {
      build.onLoad({ filter: /.*/, namespace: 'file' }, (args) => {
        files.add(args.path)
      })
    },
  }
  const output: ESBuildOptions = templates
    ? {
        entryPoints: templates.map((_, i) => ({
          in: `${ENTRY}:${i}`,
          out: bundleName(i).slice(0, -3),
        })),
        outdir: runner.files,
        splitting: true,
        // The stack mapper finds them by the end of their names
        chunkNames: 'bundle-chunk-[hash]-out',
      }
    : {
        stdin: {
          contents: entry(tmpl as string),
          resolveDir: runner.options.cwd,
        },
        outfile: path.join(runner.files, 'bundle-out.js'),
      }
  const defaultOptions: ESBuildOptions = {
    ...output,
    bundle: true,
    sourcemap: 'inline',
    platform: 'browser',
    format: 'esm',
    plugins: [
      envPlugin,
      ...(templates ? [entriesPlugin] : []),
      ...(runner.watching ? [watchPlugin] : []),
      wasmLoader(),
    ],
    inject: [path.join(__dirname, 'inject-process.js')],
    alias: polyfillAliases,
    external: ['node:async_hooks', 'node:fs', 'msw/node'],
    define: {
      global: 'globalThis',
    },
  }
  const options = merge<ESBuildOptions>(
    defaultOptions,
    config,
    runner.options.buildConfig
  )
  // It prefixes the imports of the chunks too, they're not served there
  if (templates && options.publicPath) {
    options.splitting = false
  }
  await esbuild.build(options)

  return {
    outNames: templates
      ? templates.map((_, i) => bundleName(i))
      : ['bundle-out.js'],
    files,
  }
}
