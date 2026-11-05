import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { watch } from 'chokidar'
import { asyncExitHook, gracefulExit } from 'exit-hook'
// @ts-expect-error
import mergeOptions from 'merge-options'
import { nanoid } from 'nanoid'
// @ts-expect-error
import { premove } from 'premove'
import * as DefaultRunners from '../test-runners.js'
import {
  assertRunTimeout,
  createPolka,
  DEFAULT_RUN_TIMEOUT,
  findTests,
  log,
  runTimeoutMessage,
} from '../utils/index.js'
import { killTree, withLocalBins } from '../utils/process.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const merge = mergeOptions.bind({ ignoreUndefined: true })

/**
 * @typedef {import('../types.js').RunnerOptions} RunnerOptions
 * @typedef {import('../types.js').TestRunner} TestRunner
 */

/**
 * @type {import('../types.js').RunnerOptions}
 */
const defaultOptions = {
  cwd: process.cwd(),
  assets: '',
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

/** c8's defaults leave out .mts and .cts, passing any replaces all of them. */
const COVERAGE_EXTENSIONS = [
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.mts',
  '.cts',
]

/**
 * Runs tests directly in Node.js without bundling.
 *
 * The test runner entry is piped to `node --input-type=module` through stdin so
 * imports resolve from `options.cwd`, just like a module living in the project.
 * Unless `options.transform` is off, `hooks.js` is preloaded to transform project
 * files one by one.
 */
export class NodeRunner {
  /**
   *
   * @param {Partial<import('../types.js').RunnerOptions>} options
   * @param {string[]} [testFiles]
   */
  constructor(options, testFiles) {
    /** @type {import('../types.js').RunnerOptions} */
    this.options = merge(defaultOptions, options)
    assertRunTimeout(this.options.runTimeout)
    /** @type {import('polka').Polka["server"] | undefined} */
    this.server = undefined
    /** @type {import('node:child_process').ChildProcess | undefined} */
    this.child = undefined
    this.dir = path.join(__dirname, '../.tmp', nanoid())
    mkdirSync(this.dir, {
      recursive: true,
    })
    this.stopped = false
    this.watching = false
    /**
     * @type {import('../types.js').RunnerEnv}
     */
    this.env = merge(JSON.parse(JSON.stringify(process.env)), {
      PW_OPTIONS: JSON.stringify(this.options),
      NODE_ENV: 'test',
    })
    this.tests =
      testFiles ??
      findTests({
        cwd: this.options.cwd,
        extensions: this.options.extensions.split(','),
        filePatterns: options.input ?? [],
      })

    if (this.tests.length === 0) {
      this.stop(false, 'No test files were found.')
    }
  }

  async #setupServer() {
    // setup http server
    const { server, url } = await createPolka(
      this.dir,
      this.options.cwd,
      this.options.assets
    )
    this.env.PW_SERVER = url
    this.server = server
  }

  /**
   * Compile the test runner entry module
   */
  #entry() {
    return this.options.testRunner.compileRuntime(
      this.options,
      this.tests.map(
        (t) => pathToFileURL(path.resolve(this.options.cwd, t)).href
      )
    )
  }

  /**
   * Run the tests in a node subprocess, with the same node running this one.
   *
   * @returns {{
   *   child: import('node:child_process').ChildProcess,
   *   finished: Promise<boolean>
   * }} `finished` tells if the tests passed, it never rejects
   */
  runTests() {
    const nodeArgs = ['--enable-source-maps', '--input-type=module']
    if (this.options.transform) {
      nodeArgs.push('--import', new URL('hooks.js', import.meta.url).href)
    }
    const args = this.options.cov
      ? [
          // c8 is our dependency, the project may not be able to reach its bin
          fileURLToPath(import.meta.resolve('c8/bin/c8.js')),
          '--reporter=text',
          '--reporter=json',
          '--report-dir',
          this.options.reportDir,
          ...COVERAGE_EXTENSIONS.map((ext) => `--extension=${ext}`),
          process.execPath,
          ...nodeArgs,
        ]
      : nodeArgs

    const child = spawn(process.execPath, args, {
      cwd: this.options.cwd,
      env: withLocalBins(this.env, this.options.cwd),
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    this.child = child
    // It's gone when it ends or fails to start before reading all of the entry
    child.stdin.on('error', () => {
      // noop
    })
    child.stdin.end(this.#entry())

    const finished = new Promise((resolve) => {
      child.once('error', (error) => {
        log.error(`Could not start tests: ${error.message}`)
        resolve(false)
      })
      child.once('close', (code) => resolve(code === 0))
    })
    return { child, finished }
  }

  async run() {
    asyncExitHook(this.#clean.bind(this), {
      wait: 1000,
    })

    await this.#setupServer()
    await this.options.beforeTests(this.env)

    const { child, finished } = this.runTests()
    const ms = this.options.runTimeout
    let timedOut = false
    /** @type {NodeJS.Timeout | undefined} */
    let timer
    if (ms > 0 && !this.options.debug) {
      timer = setTimeout(() => {
        timedOut = true
        killTree(child)
      }, ms)
    }

    const passed = await finished
    clearTimeout(timer)
    if (!passed) {
      await this.stop(true, timedOut ? runTimeoutMessage(ms) : 'Tests failed.')
    }
    this.stop(false, 'Tests passed.')
  }

  async watch() {
    asyncExitHook(this.#clean.bind(this), {
      wait: 1000,
    })

    await this.#setupServer()
    await this.options.beforeTests(this.env)

    const cwd = this.options.cwd
    const extensions = this.options.extensions.split(',')
    let tests = this.runTests()
    let restarting = false
    let pending = false

    // Wait for the previous run to exit before starting the next one, and
    // coalesce changes that happen while restarting into a single run
    const restart = async () => {
      if (restarting) {
        pending = true
        return
      }
      restarting = true
      do {
        pending = false
        log.info('Reloading tests...')
        killTree(tests.child)
        await tests.finished
        tests = this.runTests()
      } while (pending)
      restarting = false
    }

    // Watch for changes in the project, ignoring dot folders and node_modules
    watch(cwd, {
      ignored: (file, stats) => {
        const rel = path.relative(cwd, file)
        if (
          rel
            .split(path.sep)
            .some((part) => part.startsWith('.') || part === 'node_modules')
        ) {
          return true
        }
        return Boolean(
          stats?.isFile() && !extensions.includes(path.extname(file).slice(1))
        )
      },
      ignoreInitial: true,
      awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 },
    }).on('change', restart)
  }

  async #clean() {
    // Don't leave the tests running when this process gets stopped
    if (this.child) {
      killTree(this.child)
    }
    // Run after tests hook
    await this.options.afterTests(this.env)
    await premove(this.dir)
    const serverClose = new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            return reject(err)
          }
          resolve(true)
        })
      } else {
        resolve(true)
      }
    })

    await serverClose
  }

  /**
   * @param {boolean} fail
   * @param {string | undefined} [msg]
   */
  stop(fail, msg) {
    if (this.stopped || this.options.debug) {
      return Promise.resolve()
    }
    this.stopped = true

    if (fail && msg) {
      log.error(msg)
    } else if (msg) {
      log.success(msg)
    }

    gracefulExit(fail ? 1 : 0)
  }
}
