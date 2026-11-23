import type { Server } from 'node:http'
import { WriteStream } from 'node:tty'
import { asyncExitHook, gracefulExit } from 'exit-hook'
import { mkdirSync, rmSync } from 'fs'
// @ts-expect-error
import mergeOptions from 'merge-options'
import { nanoid } from 'nanoid'
import os from 'os'
import path from 'path'
import type { Config, RunnerEnv, RunnerOptions } from './types.ts'
import {
  AFTER_TESTS_TIMEOUT,
  assertRunTimeout,
  closeServer,
  defaultOptions,
  findTests,
  log,
  RUNNING_TEST_TIMEOUT,
  resolveTestRunner,
  runAfterTests,
  runTimeoutMessage,
  UsageError,
  withTimeout,
} from './utils/index.ts'

const merge = mergeOptions.bind({ ignoreUndefined: true, concatArrays: true })
// The browser or the tests are gone by then, nothing should hold it open
const SERVER_CLOSE_WAIT = 1000

/**
 * Delete a folder of the run, not being able to doesn't change how it went.
 * The processes of a browser can still hold its files for a while after it
 * exits on Windows.
 */
export function removeFolder(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
  } catch (error) {
    log.warn(`Could not delete ${dir}: ${(error as Error).message}`)
  }
}

const COLOR_SWITCHES = new Set([
  'FORCE_COLOR',
  'NO_COLOR',
  'NODE_DISABLE_COLORS',
])

/**
 * Whether the streams of this process are TTYs and the colors their terminal
 * has, for the `process.stdout` and `process.stderr` of browsers. The color
 * depth comes from the env the tests get and leaves out the variables that
 * turn colors on or off, browsers check those in their own env like Node.js does.
 */
function stdio(testEnv: NodeJS.ProcessEnv) {
  // Undefined values never reach the tests, Node.js checks keys like `CI` with `in`
  const env = Object.fromEntries(
    Object.entries(testEnv).filter(
      ([key, value]) => value !== undefined && !COLOR_SWITCHES.has(key)
    )
  )
  const colorDepth = WriteStream.prototype.getColorDepth(env)
  return {
    stdout: { isTTY: Boolean(process.stdout.isTTY), colorDepth },
    stderr: { isTTY: Boolean(process.stderr.isTTY), colorDepth },
  }
}

/**
 * What running the tests takes in a browser and in node.
 *
 * Every run ends in `exit`, through `stop`, or in the exit hook when this
 * process gets stopped. Both stop the tests first, then run the afterTests
 * hook, then the hook deletes what the run made, see `#clean`.
 */
export class BaseRunner {
  options: RunnerOptions
  server: Server | undefined
  dir: string
  stopped: boolean
  beforeTestsOutput: unknown
  afterTestsResult: Promise<boolean> | undefined
  env: RunnerEnv
  tests: string[]
  #beforeTests: Promise<unknown> | undefined

  constructor(options: Config, testFiles?: string[]) {
    this.options = merge(defaultOptions, options)
    this.options.testRunner = resolveTestRunner(
      this.options as { runner: string }
    )
    assertRunTimeout(this.options.runTimeout)
    this.assertOptions()
    this.options.cwd = path.resolve(this.options.cwd)
    this.server = undefined
    this.dir = path.join(os.tmpdir(), `playwright-test-${nanoid()}`)
    this.stopped = false
    this.beforeTestsOutput = undefined
    this.afterTestsResult = undefined
    this.env = merge(JSON.parse(JSON.stringify(process.env)), {
      PW_OPTIONS: JSON.stringify(this.options),
      PW_STDIO: JSON.stringify(stdio(process.env)),
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
      throw new UsageError('No test files were found.')
    }

    // Only for the user, the temp folder is shared and the run has the
    // browser profile and the trace before it's kept
    mkdirSync(this.dir, {
      recursive: true,
      mode: 0o700,
    })
  }

  /**
   * Check the options only this runner cares about, before anything gets created.
   */
  assertOptions() {
    // Nothing to check by default
  }

  /**
   * Clean up when this process ends, however it does, see `#clean`. First thing
   * in `run` and `watch`.
   *
   * The exit hook only runs once, and Playwright raises an interrupt again
   * when no other listener is left, so there's one more. A second interrupt
   * stops waiting for the hook, and for the tests to end, see `killTests`.
   */
  handleExit() {
    asyncExitHook((exitCode) => this.#clean(exitCode), {
      // Waiting for a beforeTests hook still running, then the afterTests one
      wait: 2 * AFTER_TESTS_TIMEOUT + SERVER_CLOSE_WAIT + this.cleanupWait(),
    })
    let interrupted = false
    process.on('SIGINT', () => {
      if (interrupted) {
        this.killTests()
        this.removeFiles()
        process.exit(130)
      }
      interrupted = true
    })
  }

  /**
   * Fail the run when it takes too long, from the beforeTests hook on. What
   * the mode needs before that doesn't count, like downloading a browser.
   */
  startRunTimeout() {
    const ms = this.options.runTimeout
    if (ms > 0 && !this.options.debug) {
      setTimeout(async () => {
        const runningTest = await withTimeout(
          this.runningTest().catch(() => undefined),
          RUNNING_TEST_TIMEOUT
        )
        await this.stop(true, runTimeoutMessage(ms, runningTest))
      }, ms).unref()
    }
  }

  /**
   * The full name of the test that's running, when the mode can tell.
   */
  runningTest(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }

  async runBeforeTests() {
    // A hook can return anything, and throw right away
    this.#beforeTests = new Promise((resolve) => {
      resolve(this.options.beforeTests(this.env))
    })
    this.beforeTestsOutput = await this.#beforeTests
    // The hook can change the env, like TERM, and with it the color depth
    this.env.PW_STDIO = JSON.stringify(stdio(this.env))
  }

  /**
   * Run the after tests hook once, `exit` needs its result for the exit code
   * and when this process gets stopped only the exit hook gets to run it.
   */
  runAfterTests() {
    this.afterTestsResult ??= this.#afterTests()
    return this.afterTestsResult
  }

  /**
   * It's the other half of `beforeTests`, so not without one that finished.
   * The run can end while that one still runs, what it starts still needs
   * the afterTests hook.
   */
  async #afterTests() {
    if (!this.#beforeTests) {
      return true
    }
    const finished = await withTimeout(
      this.#beforeTests.then(
        () => true,
        () => false
      ),
      AFTER_TESTS_TIMEOUT,
      'timed out'
    )
    if (finished === 'timed out') {
      log.warn(
        `The beforeTests hook did not finish in ${AFTER_TESTS_TIMEOUT}ms, not running the afterTests hook.`
      )
    }
    if (finished !== true) {
      return true
    }
    return runAfterTests(
      this.options.afterTests,
      this.env,
      this.beforeTestsOutput
    )
  }

  /**
   * Stop what runs the tests, before the afterTests hook: it can stop what
   * they use. It can be called more than once and has to end in time, see
   * `cleanupWait`.
   */
  async stopTests() {
    // Nothing runs them by default
  }

  /**
   * End what runs the tests right away, this process exits without waiting
   * for anything.
   */
  killTests() {
    // Nothing runs them by default
  }

  /**
   * Delete or keep what else the run made, after the afterTests hook, it can
   * decide how the run ends. The server and the files of the run come after.
   */
  async cleanUp(_exitCode: number) {
    // Nothing else by default
  }

  /**
   * The most `stopTests` and `cleanUp` take together, the exit hook waits for it.
   */
  cleanupWait() {
    return 0
  }

  /**
   * Delete the files of this run, not being able to doesn't change how it went.
   */
  removeFiles() {
    removeFolder(this.dir)
  }

  async #clean(exitCode: number) {
    // Whatever is still running fails from here on, it can't stop the run again
    this.stopped = true
    await this.stopTests()
    await this.runAfterTests()
    await this.cleanUp(exitCode)
    await closeServer(this.server, SERVER_CLOSE_WAIT)
    this.removeFiles()
  }

  /**
   * End the run once, whatever ends it first.
   */
  async stop(fail: boolean, msg?: unknown) {
    if (this.stopped) {
      return
    }
    this.stopped = true
    await this.exit(fail, msg)
  }

  /**
   * End the process, the after tests hook failing also fails the run.
   */
  async exit(fail: boolean, msg?: unknown) {
    if (fail && msg) {
      log.error(msg)
    }
    await this.stopTests()
    const afterTestsPassed = await this.runAfterTests()
    gracefulExit(fail || !afterTestsPassed ? 1 : 0)
  }
}
