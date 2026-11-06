import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { watch } from 'chokidar'
import { asyncExitHook } from 'exit-hook'
import { BaseRunner } from '../base-runner.js'
import {
  AFTER_TESTS_TIMEOUT,
  createPolka,
  log,
  runTimeoutMessage,
} from '../utils/index.js'
import { killTree, withLocalBins } from '../utils/process.js'

const EXIT_WAIT = 1000

/**
 * @typedef {import('../types.js').RunnerOptions} RunnerOptions
 */

/**
 * Runs tests directly in Node.js without bundling.
 *
 * The test runner entry is piped to `node --input-type=module` through stdin so
 * imports resolve from `options.cwd`, just like a module living in the project.
 * Unless `options.transform` is off, `hooks.js` is preloaded to transform project
 * files one by one.
 */
export class NodeRunner extends BaseRunner {
  /**
   *
   * @param {import('../types.js').Config} options
   * @param {string[]} [testFiles]
   */
  constructor(options, testFiles) {
    super(options, testFiles)
    /** @type {import('node:child_process').ChildProcess | undefined} */
    this.child = undefined
    // For reporters to remove our frames from stack traces
    this.env.PW_TEST_SRC = new URL('../', import.meta.url).href.replace(
      'file://',
      ''
    )
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
    const nodeArgs = [
      '--enable-source-maps',
      '--input-type=module',
      ...(this.options.testRunner.nodeArgs?.(this.options) ?? []),
    ]
    if (this.options.transform) {
      nodeArgs.push('--import', new URL('hooks.js', import.meta.url).href)
    }

    const child = spawn(process.execPath, nodeArgs, {
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
    if (this.stopped) {
      return
    }
    asyncExitHook(this.#clean.bind(this), {
      wait: AFTER_TESTS_TIMEOUT + EXIT_WAIT,
    })

    await this.#setupServer()
    await this.runBeforeTests()
    // Stopped during the hook, nothing would stop the tests started now
    if (this.stopped) {
      return
    }

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
    this.stop(false)
  }

  async watch() {
    if (this.stopped) {
      return
    }
    asyncExitHook(this.#clean.bind(this), {
      wait: AFTER_TESTS_TIMEOUT + EXIT_WAIT,
    })

    await this.#setupServer()
    await this.runBeforeTests()
    // Stopped during the hook, nothing would stop the tests started now
    if (this.stopped) {
      return
    }

    const cwd = this.options.cwd
    const extensions = this.options.extensions.split(',')
    let tests = this.runTests()
    let restarting = false
    let pending = false

    // Wait for the previous run to exit before starting the next one, and
    // coalesce changes that happen while restarting into a single run
    const restart = async () => {
      if (this.stopped) {
        return
      }
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
        // Stopped in the meantime, nothing would stop the tests started now
        if (this.stopped) {
          return
        }
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
    this.stopped = true

    // Don't leave the tests running when this process gets stopped
    if (this.child) {
      killTree(this.child)
    }
    await this.runAfterTests()
    this.removeFiles()

    /** @type {NodeJS.Timeout | undefined} */
    let timer
    await Promise.race([
      new Promise((resolve) => {
        if (this.server) {
          this.server.close(() => resolve(true))
        } else {
          resolve(true)
        }
      }),
      new Promise((resolve) => {
        timer = setTimeout(resolve, EXIT_WAIT)
      }),
    ])
    clearTimeout(timer)
  }

  /**
   * @param {boolean} fail
   * @param {string | undefined} [msg]
   */
  async stop(fail, msg) {
    // Also with --debug, there's no browser to keep open
    if (this.stopped) {
      return
    }
    this.stopped = true

    await this.exit(fail, msg)
  }
}
