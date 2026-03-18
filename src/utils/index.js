/* eslint-disable no-console */

import fs from 'fs'
import { createServer } from 'http'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { promisify } from 'util'
import camelCase from 'camelcase'
import esbuild from 'esbuild'
import { wasmLoader } from 'esbuild-plugin-wasm'
import kleur from 'kleur'
// @ts-ignore
import mergeOptions from 'merge-options'
import ora from 'ora'
import polka from 'polka'
import sirv from 'sirv'
import { globSync } from 'tinyglobby'
import V8ToIstanbul from 'v8-to-istanbul'
import * as DefaultRunners from '../test-runners.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const merge = mergeOptions.bind({
  ignoreUndefined: true,
  concatArrays: true,
})

/**
 * @type {import('../types').RunnerOptions}
 */
export const defaultOptions = {
  cwd: process.cwd(),
  assets: undefined,
  browser: 'chromium',
  debug: false,
  mode: 'main', // worker
  incognito: false,
  input: undefined,
  extension: false,
  testRunner: DefaultRunners.none,
  before: undefined,
  sw: undefined,
  cov: false,
  reportDir: '.nyc_output',
  extensions: 'js,cjs,mjs,ts,tsx,jsx',
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
  /**
   * @param {string} message
   * @param {boolean} quiet
   */
  success(message, quiet = false) {
    if (!quiet) {
      console.warn(kleur.green('✔'), message)
    }
  },
}

/**
 * @typedef {import('../types').RunnerOptions } RunnerOptions
 * @typedef {import('esbuild').Plugin} ESBuildPlugin
 * @typedef {import('esbuild').BuildOptions} ESBuildOptions
 */

const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)

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
function globFiles(cwd, patterns) {
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
 * Find files
 *
 * @param {object} options
 * @param {string} options.cwd
 * @param {string[]} options.extensions
 * @param {string[]} options.filePatterns
 */
function findFiles({ cwd, extensions, filePatterns }) {
  return globFiles(cwd, filePatterns).filter((file) =>
    hasExtension(extensions, file)
  )
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
  return findFiles({
    cwd,
    extensions,
    filePatterns,
  }).filter((file) => !path.basename(file).startsWith('_'))
}

/**
 * workaround to get hidden description
 * jsonValue() on errors returns {}
 *
 * @param {any} arg
 */
function extractErrorMessage(arg) {
  // pup-firefox doesnt have this
  if (arg._remoteObject) {
    return arg._remoteObject.subtype === 'error'
      ? arg._remoteObject.description
      : undefined
  }
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

  // we ignore calls to console.clear, as we don't want the page to clear our terminal
  // clear: console.clear
}

/**
 * @param {import('playwright-core').ConsoleMessage} msg
 */
export async function redirectConsole(msg) {
  const type = msg.type()
  const consoleFn = messageTypeToConsoleFn[type]

  if (!consoleFn) {
    return
  }
  const text = msg.text()

  // skip browser informational warnings
  if (
    text?.includes(
      'Synchronous XMLHttpRequest on the main thread is deprecated'
    ) ||
    text?.includes('Clear-Site-Data')
  ) {
    return
  }

  // const { url, lineNumber, columnNumber } = msg.location()
  let msgArgs

  try {
    msgArgs = await Promise.all(
      msg.args().map((arg) => extractErrorMessage(arg) || arg.jsonValue())
    )
  } catch {
    // ignore error runner was probably force stopped
  }

  if (msgArgs && msgArgs.length > 0) {
    consoleFn.apply(console, msgArgs)
  } else if (text) {
    console.error(kleur.dim(`🌐${text}`))
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
    // @ts-ignore
    browserName = 'chromium-headless-shell'
  }

  // @ts-ignore
  const { registry } = await import('playwright-core/lib/server')
  const api = await import('playwright-core')
  const browser = registry.findExecutable(browserName)

  // playwright will log browser download progress to stdout, temporarily
  // redirect the output to stderr
  const log = console.log
  const info = console.info

  try {
    console.log = console.error
    console.info = console.error
    await registry.install([browser])
  } finally {
    console.log = log
    console.info = info
  }
  // @ts-ignore
  if (browserName === 'chromium-headless-shell') {
    return api.chromium
  }

  // @ts-ignore
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
 * @param {{ [x: string]: any; }} flags
 */
export function runnerOptions(flags) {
  const opts = {}

  for (const key in flags) {
    const value = flags[key]
    const localFlags = [
      'browser',
      'runner',
      'watch',
      'debug',
      'mode',
      'incognito',
      'extension',
      'cwd',
      'extensions',
      'assets',
      'before',
      'cov',
      'config',
      'sw',
      'report-dir',
      '_',
      'd',
      'r',
      'b',
      'm',
      'w',
      'i',
      'e',
    ]

    if (!localFlags.includes(key)) {
      // @ts-ignore
      opts[camelCase(key)] = value
    }
  }

  return opts
}

/**
 * Build the bundle
 *
 * @param {import("../runner").Runner} runner
 * @param {ESBuildOptions} config - Runner esbuild config
 * @param {string} tmpl
 * @param {"bundle" | "before" | "watch"} mode
 */
export async function build(runner, config = {}, tmpl = '', mode = 'bundle') {
  const outName = `${mode}-out.js`
  const outPath = path.join(runner.dir, outName)
  const files = new Set()
  const sourceMapSupport = path.join(
    __dirname,
    '../vendor/source-map-support.js'
  )

  // main script template
  let infileContent = `
import { install } from '${sourceMapSupport.replaceAll('\\', '/')}'
install()
process.env = ${JSON.stringify(runner.env)}
import.meta.env = ${JSON.stringify(runner.env)}

${tmpl}
`
  // before script template
  if (mode === 'before' && runner.options.before) {
    infileContent = `
import { install } from '${sourceMapSupport.replaceAll('\\', '/')}'
install()
process.env = ${JSON.stringify(runner.env)}
import.meta.env = ${JSON.stringify(runner.env)}

await import('${require
      .resolve('../../static/setup.js')
      .replaceAll('\\', '/')}')
await import('${require
      .resolve(path.join(runner.options.cwd, runner.options.before))
      .replaceAll('\\', '/')}')
`
  }

  /** @type {ESBuildPlugin} */
  const nodePlugin = {
    name: 'node built ins',
    setup(build) {
      build.onResolve({ filter: /^path$/ }, () => {
        return { path: require.resolve('path-browserify') }
      })
    },
  }
  /** @type {ESBuildPlugin} */
  const watchPlugin = {
    name: 'watcher',
    setup(build) {
      // @ts-ignore
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
    plugins: [nodePlugin, watchPlugin, wasmLoader()],
    outfile: outPath,
    inject: [path.join(__dirname, 'inject-process.js')],
    external: ['node:async_hooks', 'node:fs', 'msw/node'],
    define: {
      global: 'globalThis',
      PW_TEST_SOURCEMAP: runner.options.debug ? 'false' : 'true',
      PW_TEST_SOURCEMAP_PATH: JSON.stringify(runner.dir),
    },
  }
  await esbuild.build(merge(defaultOptions, config, runner.options.buildConfig))

  return { outName, files }
}

/**
 * Create coverage report in istanbul JSON format
 *
 * @param {import("../runner").Runner} runner
 * @param {any} coverage
 * @param {string} file
 * @param {string} outputDir
 */
export async function createCov(runner, coverage, file, outputDir) {
  const spinner = ora('Generating code coverage.').start()
  const entries = {}
  const { cwd } = runner.options
  // @ts-ignore
  const TestExclude = require('test-exclude')
  const exclude = new TestExclude({ cwd })
  // @ts-ignore
  const f = new Set(exclude.globSync().map((f) => path.join(cwd, f)))
  for (const entry of coverage) {
    const filePath = path.resolve(runner.dir, entry.url.replace(runner.url, ''))

    if (filePath.includes(file)) {
      // @ts-ignore
      const converter = new V8ToIstanbul(
        filePath,
        0,
        {
          source: entry.source,
        }
        // (path) => {
        //   return !f.has(path)
        // }
      )

      await converter.load()
      converter.applyCoverage(entry.functions)
      const instanbul = converter.toIstanbul()

      for (const key in instanbul) {
        if (f.has(key)) {
          // @ts-ignore
          entries[key] = instanbul[key]
        }
      }
    }
  }
  const covPath = path.join(cwd, outputDir)

  await mkdir(covPath, { recursive: true })

  await writeFile(
    path.join(covPath, 'coverage-pw.json'),
    JSON.stringify(entries)
  )
  spinner.succeed('Code coverage generated, run "npx nyc report".')
}

/**
 * Resolves module id from give base or cwd
 *
 * @param {string} id - module id
 * @param {string} [base] - base path
 */
export async function resolveModule(id, base = process.cwd()) {
  try {
    // Note we need to ensure base has trailing `/` or the the
    // last entry is going to be dropped during resolution.
    const path = createRequire(toDirectoryPath(base)).resolve(id)
    const url = pathToFileURL(path)
    return await import(url.href)
  } catch (error) {
    throw new Error(
      `Cannot resolve module "${id}" from "${base}"\n${
        /** @type {Error} */ (error).message
      }`
    )
  }
}

/**
 * Ensures that path ends with a path separator
 *
 * @param {string} source
 */
export const toDirectoryPath = (source) =>
  source.endsWith(path.sep) ? source : `${source}${path.sep}`

/**
 *
 * @param {string} runner
 * @param {string} cwd
 */
export async function resolveTestRunner(runner, cwd) {
  const module = await resolveModule(runner, cwd)
  /** @type {import('../types.js').TestRunner} */
  const testRunner = module.playwrightTestRunner
  if (!testRunner) {
    throw new Error(`Cannot find playwrightTestRunner export in ${path}`)
  }
  return testRunner
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
      // @ts-ignore
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        server.listen(0, host)
      } else {
        reject(err)
      }
    })
    server.on('listening', () => {
      // @ts-ignore
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
 * @param {string[]| undefined} assets - Assets directories
 * @returns {Promise<{ url: string; server: import('http').Server }>}
 */
export async function createPolka(dir, cwd, assets) {
  const host = '127.0.0.1'
  const port = await getPort(0, host)
  const url = `http://${host}:${port}/`
  if (typeof assets === 'string') {
    assets = [assets]
  } else if (assets === undefined || assets === null) {
    assets = []
  }
  if (!assets.includes(cwd)) {
    assets.push(cwd)
  }
  return new Promise((resolve, reject) => {
    const { server } = polka()
      .use(
        // @ts-ignore
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
        // @ts-ignore
        ...assets.map((dir) =>
          sirv(dir, {
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
