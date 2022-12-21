/* eslint-disable no-console */

import mergeOptions from 'merge-options'
import path from 'path'
import fs from 'fs'
import kleur from 'kleur'
import camelCase from 'camelcase'
import sirv from 'sirv'
import esbuild from 'esbuild'
import V8ToIstanbul from 'v8-to-istanbul'
import { promisify } from 'util'
import { globbySync } from 'globby'
import ora from 'ora'
import { createServer } from 'http'
import polka from 'polka'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const merge = mergeOptions.bind({
  ignoreUndefined: true,
  concatArrays: true,
})

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
  const files = globbySync(patterns, {
    absolute: false,
    braceExpansion: true,
    caseSensitiveMatch: false,
    cwd,
    dot: false,
    expandDirectories: true,
    extglob: true,
    followSymbolicLinks: true,
    gitignore: false,
    globstar: true,
    ignore: defaultIgnorePatterns,
    baseNameMatch: false,
    onlyFiles: true,
    stats: false,
    unique: true,
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
 * @param {string} options.cwd
 * @param {string[]} options.extensions
 * @param {string[]} options.filePatterns
 */
export function findTests({ cwd, extensions, filePatterns }) {
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
  timeEnd: console.timeEnd,

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
  const { url, lineNumber, columnNumber } = msg.location()
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
    let color = 'white'

    if (
      text.includes(
        'Synchronous XMLHttpRequest on the main thread is deprecated'
      )
    ) {
      return
    }
    switch (type) {
      case 'error': {
        color = 'red'
        break
      }
      case 'warning': {
        color = 'yellow'
        break
      }
      case 'info':
      case 'debug': {
        color = 'blue'
        break
      }
      default: {
        break
      }
    }

    // @ts-ignore
    consoleFn(kleur[color](text))

    console.info(
      kleur.gray(
        `${url}${
          lineNumber
            ? ':' + lineNumber + (columnNumber ? ':' + columnNumber : '')
            : ''
        }`
      )
    )
  }
}

/**
 * @template {RunnerOptions["browser"]} TBrowser
 * @param {TBrowser} browserName
 * @returns {Promise<import('playwright-core').BrowserType<import('../types').PwResult<TBrowser>>>}
 */
export async function getPw(browserName) {
  if (!['chromium', 'firefox', 'webkit'].includes(String(browserName))) {
    throw new Error(`Browser not supported: ${browserName}`)
  }

  // @ts-ignore
  const { registry } = await import('playwright-core/lib/server')
  const api = await import('playwright-core')
  const browser = registry.findExecutable(browserName)

  await registry.install([browser])

  return api[browserName]
}

/**
 * @param {string} filePath
 */
export function addWorker(filePath) {
  return `
const w = new Worker("${filePath}");
w.onmessage = function(e) {
    if(e.data.pwRunEnded) {
        self.PW_TEST.end(e.data.pwRunFailed)
    }
}
`
}

/**
 * @param {{ [x: string]: any; }} flags
 */
export function runnerOptions(flags) {
  const opts = {}

  // eslint-disable-next-line guard-for-in
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
      'node',
      'cov',
      'config',
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
'use strict'
require('${sourceMapSupport.replace(/\\/g, '/')}').install();
process.env = ${JSON.stringify(runner.env)}

${tmpl}

${runner.tests.map((t) => `require('${t.replace(/\\/g, '/')}')`).join('\n')}
`

  // before script template
  if (mode === 'before' && runner.options.before) {
    infileContent = `
'use strict'
require('${sourceMapSupport.replace(/\\/g, '/')}').install();
process.env = ${JSON.stringify(runner.env)}

require('${require.resolve('../static/setup.js').replace(/\\/g, '/')}')
require('${require
      .resolve(path.join(runner.options.cwd, runner.options.before))
      .replace(/\\/g, '/')}')
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
    plugins: [nodePlugin, watchPlugin],
    outfile: outPath,
    inject: [path.join(__dirname, 'inject-process.js')],
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

      // eslint-disable-next-line no-await-in-loop
      await converter.load()
      converter.applyCoverage(entry.functions)
      const instanbul = converter.toIstanbul()

      // eslint-disable-next-line guard-for-in
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
 * @param {import('../runner').Runner} runner
 */
export async function createPolka(runner) {
  const host = '127.0.0.1'
  const port = await getPort(0, host)
  const url = `http://${host}:${port}/`
  return new Promise((resolve, reject) => {
    const { server } = polka()
      .use(
        // @ts-ignore
        sirv(runner.dir, {
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
        sirv(path.join(runner.options.cwd, runner.options.assets), {
          dev: true,
        })
      )
      .listen(port, host, (/** @type {Error} */ err) => {
        if (err) {
          reject(err)

          return
        }
        runner.url = url
        runner.server = server
        resolve(true)
      })
  })
}
