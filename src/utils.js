/* eslint-disable no-console */
'use strict'

const { createServer } = require('net')
const path = require('path')
const fs = require('fs')
const { promisify } = require('util')
const esbuild = require('esbuild')
const kleur = require('kleur')
const globby = require('globby')
const ora = require('ora')
const sirv = require('sirv')
const polka = require('polka')
const camelCase = require('camelcase')
const V8ToIstanbul = require('@hd-forks/v8-to-istanbul')
const merge = require('merge-options').bind({
  ignoreUndefined: true,
  concatArrays: true,
})

/**
 * @typedef {import('./types').RunnerOptions } RunnerOptions
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
function defaultTestPatterns(extensions) {
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
  const files = globby.sync(patterns, {
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
 * @param {Object} options
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
 * @param {Object} options
 * @param {string} options.cwd
 * @param {string[]} options.extensions
 * @param {string[]} options.filePatterns
 */
function findTests({ cwd, extensions, filePatterns }) {
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

  return undefined
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
async function redirectConsole(msg) {
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
  } catch (err) {
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
      case 'error':
        color = 'red'
        break
      case 'warning':
        color = 'yellow'
        break
      case 'info':
      case 'debug':
        color = 'blue'
        break
      default:
        break
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
 * @returns {Promise<import('playwright-core').BrowserType<import('./types').PwResult<TBrowser>>>}
 */
async function getPw(browserName) {
  if (!['chromium', 'firefox', 'webkit'].includes(String(browserName))) {
    throw new Error(`Browser not supported: ${browserName}`)
  }
  const {
    installBrowsersWithProgressBar,
    // @ts-ignore
  } = require('playwright-core/lib/install/installer')
  // @ts-ignore
  const setupInProcess = require('playwright-core/lib/inprocess')
  const browsers = require('playwright-core/browsers.json')
  const browsersPath = require.resolve('playwright-core/browsers.json')

  // @ts-ignore
  browsers.browsers[0].download = true // chromium
  // @ts-ignore
  browsers.browsers[1].download = true // firefox
  // @ts-ignore
  browsers.browsers[2].download = true // webkit

  fs.writeFileSync(browsersPath, JSON.stringify(browsers, null, 2))
  await installBrowsersWithProgressBar([browserName])
  const api = setupInProcess

  return api[browserName]
}

/**
 * @param {string} filePath
 */
function addWorker(filePath) {
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
function runnerOptions(flags) {
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
 * @param {import("./runner")} runner
 * @param {ESBuildOptions} config - Runner esbuild config
 * @param {string} tmpl
 * @param {"bundle" | "before" | "watch"} mode
 */
const build = async (runner, config = {}, tmpl = '', mode = 'bundle') => {
  const outName = `${mode}-out.js`
  const infile = path.join(runner.dir, 'in.js')
  const outfile = path.join(runner.dir, outName)
  const sourceMapSupport = path.join(__dirname, 'vendor/source-map-support.js')
  const nodeGlobalsInject = path.join(__dirname, 'node-globals.js')

  /** @type {ESBuildPlugin} */
  const nodePlugin = {
    name: 'node built ins',
    setup(build) {
      build.onResolve({ filter: /^path$/ }, () => {
        return { path: require.resolve('path-browserify') }
      })
    },
  }

  /** @type {import('esbuild').WatchMode} */
  const watch = {
    onRebuild: async (error) => {
      if (!error && runner.page) {
        await runner.page.reload()
        await runner.runTests(runner.page, outName)
      }
    },
  }

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

  fs.writeFileSync(infile, infileContent)
  /** @type {ESBuildOptions} */
  const defaultOptions = {
    entryPoints: [infile],
    bundle: true,
    mainFields: ['browser', 'module', 'main'],
    sourcemap: 'inline',
    plugins: [nodePlugin],
    outfile,
    inject: [nodeGlobalsInject],
    watch: mode === 'watch' ? watch : false,
    define: {
      global: 'globalThis',
      PW_TEST_SOURCEMAP: runner.options.debug ? 'false' : 'true',
    },
  }
  await esbuild.build(merge(defaultOptions, config, runner.options.buildConfig))

  return outName
}

/**
 * Create coverage report in istanbul JSON format
 *
 * @param {import("./runner")} runner
 * @param {any} coverage
 * @param {string} file
 */
const createCov = async (runner, coverage, file) => {
  const spinner = ora('Generating code coverage.').start()
  const entries = {}
  const { cwd } = runner.options
  // @ts-ignore
  const TestExclude = require('test-exclude')
  const exclude = new TestExclude()
  // @ts-ignore
  const f = exclude.globSync().map((f) => path.resolve(f))

  for (const entry of coverage) {
    const filePath = path.join(runner.dir, entry.url.replace(runner.url, ''))

    if (filePath.includes(file)) {
      // @ts-ignore
      const converter = new V8ToIstanbul(filePath, 0, { source: entry.source })

      // eslint-disable-next-line no-await-in-loop
      await converter.load()
      converter.applyCoverage(entry.functions)
      const instanbul = converter.toIstanbul()

      // eslint-disable-next-line guard-for-in
      for (const key in instanbul) {
        if (f.includes(key)) {
          // @ts-ignore
          entries[key] = instanbul[key]
        }
      }
    }
  }
  const covPath = path.join(cwd, '.nyc_output')

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
 * @param {import('./runner')} runner
 */
async function createPolka(runner) {
  const host = '127.0.0.1'
  const port = await getPort(3000, host)
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

module.exports = {
  extractErrorMessage,
  redirectConsole,
  defaultTestPatterns,
  findTests,
  findFiles,
  getPw,
  addWorker,
  runnerOptions,
  build,
  createCov,
  createPolka,
}
