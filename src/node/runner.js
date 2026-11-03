import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { watch } from 'chokidar'
import { execa } from 'execa'
import { asyncExitHook, gracefulExit } from 'exit-hook'
// @ts-expect-error
import mergeOptions from 'merge-options'
import { nanoid } from 'nanoid'
// @ts-expect-error
import { premove } from 'premove'
import * as DefaultRunners from '../test-runners.js'
import { createPolka, findTests, log } from '../utils/index.js'

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
  extensions: 'js,cjs,mjs,ts,tsx',
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

/**
 * Runs tests directly in Node.js without bundling.
 *
 * The test runner entry is piped to `node --input-type=module` through stdin so
 * imports resolve from `options.cwd`, just like a module living in the project.
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
    /** @type {import('polka').Polka["server"] | undefined} */
    this.server = undefined
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
   * Run the tests in a node subprocess
   */
  runTests() {
    const nodeArgs = ['--enable-source-maps', '--input-type=module']
    const [file, args] = this.options.cov
      ? [
          'c8',
          [
            '--reporter=text',
            '--reporter=json',
            '--report-dir',
            this.options.reportDir,
            'node',
            ...nodeArgs,
          ],
        ]
      : ['node', nodeArgs]

    return execa(file, args, {
      cwd: this.options.cwd,
      env: this.env,
      input: this.#entry(),
      preferLocal: true,
      stdout: 'inherit',
      stderr: 'inherit',
    })
  }

  async run() {
    asyncExitHook(this.#clean.bind(this), {
      wait: 1000,
    })

    await this.#setupServer()
    await this.options.beforeTests(this.env)

    try {
      await this.runTests()
    } catch {
      await this.stop(true, 'Tests failed.')
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
    const noop = () => {
      // noop
    }
    let subprocess = this.runTests()
    subprocess.catch(noop)
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
        // execa sends SIGKILL if the process is still alive after 5s
        subprocess.kill()
        await subprocess.catch(noop)
        subprocess = this.runTests()
        subprocess.catch(noop)
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
