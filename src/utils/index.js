/** biome-ignore-all lint/suspicious/noConsole: its ok */

import esbuild from 'esbuild'
import { wasmLoader } from 'esbuild-plugin-wasm'
import fs from 'fs'
import { createServer } from 'http'
import kleur from 'kleur'
// @ts-expect-error
import mergeOptions from 'merge-options'
import { createRequire } from 'module'
import path from 'path'
import polka from 'polka'
import sirv from 'sirv'
import { convertPathToPattern, globSync } from 'tinyglobby'
import { fileURLToPath } from 'url'
import * as DefaultRunners from '../test-runners.js'
import { polyfillAliases } from './polyfill-aliases.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const merge = mergeOptions.bind({
  ignoreUndefined: true,
  concatArrays: true,
})

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
 *
 * @param {unknown} value
 */
export function assertRunTimeout(value) {
  if (
    !Number.isInteger(value) ||
    /** @type {number} */ (value) < 0 ||
    /** @type {number} */ (value) > 2 ** 31 - 1
  ) {
    throw new UsageError(
      `Invalid run timeout "${value}", expected milliseconds or 0 to turn it off.`
    )
  }
}

/** @type {Record<string, import('../types').TestRunner>} */
const runners = {
  mocha: DefaultRunners.mocha,
  'node-test': DefaultRunners.nodeTest,
  none: DefaultRunners.none,
}

/**
 * The runner for these options, with the options from the config file.
 *
 * @param {{ runner: string, testRunner?: Partial<import('../types').TestRunner> }} options
 * @returns {import('../types').TestRunner}
 */
export function resolveTestRunner({ runner, testRunner }) {
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
 *
 * @param {import('../types').RunnerOptions} options
 */
export function assertBrowserOptions({ browser, extension, incognito, mode }) {
  if (mode !== 'main' && mode !== 'worker') {
    throw new UsageError(
      `Invalid mode "${mode}", this runner takes "main" or "worker".`
    )
  }
  if (extension && browser !== 'chromium') {
    throw new UsageError('Extension testing is only supported in chromium.')
  }
  if (extension && incognito) {
    throw new UsageError('Extension testing does not work with incognito.')
  }
}

/**
 * Run the after tests hook, it failing fails the run instead of the cleanup.
 *
 * @param {import('../types').RunnerOptions['afterTests']} afterTests
 * @param {import('../types').RunnerEnv} env
 * @param {unknown} beforeTestsOutput
 * @returns {Promise<boolean>} if it worked, it never rejects
 */
export async function runAfterTests(afterTests, env, beforeTestsOutput) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  try {
    await Promise.race([
      afterTests(env, beforeTestsOutput),
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          reject,
          AFTER_TESTS_TIMEOUT,
          new Error(`It did not finish in ${AFTER_TESTS_TIMEOUT}ms.`)
        )
      }),
    ])
    return true
  } catch (/** @type {any} */ error) {
    log.error(`The afterTests hook failed.\n${error?.stack ?? error}`)
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {number} ms
 */
export function runTimeoutMessage(ms) {
  return `Run timed out after ${ms}ms, use --run-timeout to change it.`
}

/** @type {Omit<import('../types').RunnerOptions, 'testRunner'>} */
export const defaultOptions = {
  cwd: process.cwd(),
  assets: '',
  browser: 'chromium',
  debug: false,
  mode: 'main', // worker
  incognito: false,
  input: undefined,
  extension: false,
  runner: 'none',
  before: undefined,
  sw: undefined,
  extensions: 'js,cjs,mjs,ts,tsx,jsx',
  transform: true,
  runTimeout: DEFAULT_RUN_TIMEOUT,
  buildConfig: {},
  buildSWConfig: {},
  browserContextOptions: {},
  beforeTests: async () => {
    // noop
  },
  afterTests: async () => {
    // noop
  },
}

export const log = {
  /**
   * @param {string} message
   * @param {boolean} quiet
   */
  info(message, quiet = false) {
    if (!quiet) {
      console.error(kleur.blue('ℹ'), message)
    }
  },
  /**
   * @param {string} message
   * @param {boolean} quiet
   */
  warn(message, quiet = false) {
    if (!quiet) {
      console.warn(kleur.yellow('-'), message)
    }
  },
  /**
   * @param {string} message
   * @param {boolean} quiet
   */
  error(message, quiet = false) {
    if (!quiet) {
      console.warn(kleur.red('✘'), message)
    }
  },
}

/**
 * @typedef {import('../types').RunnerOptions } RunnerOptions
 * @typedef {import('esbuild').Plugin} ESBuildPlugin
 * @typedef {import('esbuild').BuildOptions} ESBuildOptions
 */

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

/**
 * @param {string[]} extensions
 * @param {string} file
 */
function hasExtension(extensions, file) {
  return extensions.includes(path.extname(file).slice(1))
}

/**
 * @param {any[]} extensions
 */
function buildExtensionPattern(extensions) {
  return extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`
}

/**
 * @param {string[]} extensions
 */
export function defaultTestPatterns(extensions) {
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

/**
 * @param {string} cwd
 * @param {string[]} patterns
 */
function search(cwd, patterns) {
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
 *
 * @param {string} cwd
 * @param {string[]} patterns
 */
function globFiles(cwd, patterns) {
  /** @type {string[]} */
  const globs = []
  /** @type {string[]} */
  const otherDrives = []

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
 * @param {object} options
 * @param {string} options.cwd - Current working directory
 * @param {string[]} options.extensions - File extensions allowed in the bundle
 * @param {string[]} options.filePatterns - File patterns to search for
 */
export function findTests({ cwd, extensions, filePatterns }) {
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
 *
 * @param {unknown} value
 */
function describeValue(value) {
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
 *
 * @param {import('playwright-core').JSHandle} arg
 */
async function readConsoleArg(arg) {
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

/** @type {Record<string, any>} */
const messageTypeToConsoleFn = {
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
 *
 * @param {import('playwright-core').ConsoleMessage} msg
 * @param {any[]} msgArgs
 * @param {string} text
 * @param {<T>(value: T) => T} mapStack
 */
function printConsole(msg, msgArgs, text, mapStack) {
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
    console.error(kleur.dim(`🌐${text}`))
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
 * @param {import('playwright-core').ConsoleMessage} msg
 * @param {<T>(value: T) => T} mapStack - map stack traces back to the source files
 * @returns {Promise<() => void>} prints the message, it never rejects
 */
export async function readConsole(msg, mapStack) {
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
 * @template {RunnerOptions["browser"]} TBrowser
 * @param {TBrowser} browserName
 * @param {boolean} debug
 * @param {boolean} extension
 * @returns {Promise<import('playwright-core').BrowserType<import('../types').PwResult<TBrowser>>>}
 */
export async function getPw(browserName, debug, extension) {
  if (!['chromium', 'firefox', 'webkit'].includes(String(browserName))) {
    throw new Error(`Browser not supported: ${browserName}`)
  }

  if (browserName === 'chromium' && !debug && !extension) {
    // @ts-expect-error
    browserName = 'chromium-headless-shell'
  }

  const {
    registry: { registry },
    // @ts-expect-error
  } = await import('playwright-core/lib/coreBundle')
  const api = await import('playwright-core')
  const browser = registry.findExecutable(browserName)

  // playwright will log browser download progress to stdout, temporarily
  // redirect the output to stderr
  const log = console.log
  const info = console.info

  try {
    console.log = console.error
    console.info = console.error
    // Validating the browser on Windows needs winldd, same as Playwright's own install.
    await registry.install(
      process.platform === 'win32'
        ? [registry.findExecutable('winldd'), browser]
        : [browser]
    )
  } finally {
    console.log = log
    console.info = info
  }
  if (browserName === 'chromium-headless-shell') {
    return api.chromium
  }

  // @ts-expect-error
  return api[browserName]
}

/**
 * @param {string} filePath
 */
export function addWorker(filePath) {
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
}
`
}

/**
 * Build the bundle
 *
 * @param {import("../runner").Runner} runner
 * @param {ESBuildOptions} config - Runner esbuild config
 * @param {string} tmpl
 * @param {"bundle" | "before"} mode
 */
export async function build(runner, config = {}, tmpl = '', mode = 'bundle') {
  const outName = `${mode}-out.js`
  const outPath = path.join(runner.dir, outName)
  const files = new Set()

  // main script template
  let infileContent = `
Object.assign(process.env, ${JSON.stringify(runner.env)})
import.meta.env = ${JSON.stringify(runner.env)}

${tmpl}
`
  // before script template
  if (mode === 'before' && runner.options.before) {
    infileContent = `
Object.assign(process.env, ${JSON.stringify(runner.env)})
import.meta.env = ${JSON.stringify(runner.env)}

await import(${JSON.stringify(
      require.resolve('../../static/setup.js').replaceAll('\\', '/')
    )})
await import(${JSON.stringify(
      require
        .resolve(path.resolve(runner.options.cwd, runner.options.before))
        .replaceAll('\\', '/')
    )})
`
  }

  /** @type {ESBuildPlugin} */
  const watchPlugin = {
    name: 'watcher',
    setup(build) {
      build.onLoad({ filter: /.*/, namespace: 'file' }, (args) => {
        files.add(args.path)
      })
    },
  }
  /** @type {ESBuildOptions} */
  const defaultOptions = {
    stdin: {
      contents: infileContent,
      resolveDir: runner.options.cwd,
    },
    // sourceRoot: runner.dir,
    bundle: true,
    sourcemap: 'inline',
    platform: 'browser',
    format: 'esm',
    plugins: [watchPlugin, wasmLoader()],
    outfile: outPath,
    inject: [path.join(__dirname, 'inject-process.js')],
    alias: polyfillAliases,
    external: ['node:async_hooks', 'node:fs', 'msw/node'],
    define: {
      global: 'globalThis',
    },
  }
  await esbuild.build(merge(defaultOptions, config, runner.options.buildConfig))

  return { outName, files }
}

/**
 * Get a free port
 *
 * @param {number} port
 * @param {string} host
 * @returns {Promise<number>}
 */
function getPort(port = 3000, host = '127.0.0.1') {
  const server = createServer()

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      // @ts-expect-error
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        server.listen(0, host)
      } else {
        reject(err)
      }
    })
    server.on('listening', () => {
      // @ts-expect-error
      const { port } = server.address()

      server.close(() => resolve(port))
    })
    server.listen(port, host)
  })
}

/**
 * Create polka server
 *
 * @param {string} dir - Runner directory
 * @param {string} cwd - Current working directory
 * @param {string} assets - Assets directory
 * @returns {Promise<{ url: string; server: import('http').Server }>}
 */
export async function createPolka(dir, cwd, assets) {
  const host = '127.0.0.1'
  const port = await getPort(0, host)
  const url = `http://${host}:${port}/`
  return new Promise((resolve, reject) => {
    const { server } = polka()
      .use(
        sirv(dir, {
          dev: true,
          setHeaders: (
            /** @type {{ setHeader: (arg0: string, arg1: string) => void; }} */ rsp,
            /** @type {string} */ pathname
          ) => {
            if (pathname === '/') {
              rsp.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"')
              // rsp.setHeader('Clear-Site-Data', '"cache", "cookies", "storage", "executionContexts"');
            }
          },
        })
      )
      .use(
        sirv(path.resolve(cwd, assets), {
          dev: true,
          setHeaders: (
            /** @type {{ setHeader: (arg0: string, arg1: string) => void; }} */ rsp,
            /** @type {string} */ pathname
          ) => {
            // workaround for https://github.com/lukeed/sirv/issues/158 - we
            // can't unset the `Content-Encoding` header because sirv sets it
            // after this function is invoked and will only set it if it's not
            // already set, so we need to set it to a garbage value that will be
            // ignored by browsers
            if (pathname.endsWith('.gz')) {
              rsp.setHeader('Content-Encoding', 'unsupported-encoding')
            }
          },
        })
      )
      .listen(port, host, (/** @type {Error} */ err) => {
        if (err) {
          return reject(err)
        }

        if (!server) {
          return reject(new Error('No server'))
        }
        resolve({ url, server })
      })
  })
}
