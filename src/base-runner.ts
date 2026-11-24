import { Console } from 'node:console'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { WriteStream } from 'node:tty'
import { asyncExitHook, gracefulExit } from 'exit-hook'
import { mkdirSync, rmSync } from 'fs'
import { rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import type {
  Config,
  Logger,
  RunnerEnv,
  RunnerOptions,
  RunResult,
} from './types.ts'
import { type Colors, createColors, supportsColor } from './utils/colors.ts'
import {
  afterTestsTimeout,
  assertNoExtension,
  assertRunTimeout,
  closeServer,
  createLogger,
  defaultOptions,
  findTests,
  log,
  resolveTestRunner,
  runAfterTests,
  runTimeoutMessage,
  UsageError,
  withTimeout,
} from './utils/index.ts'
import { createMerge } from './utils/merge.ts'

const merge = createMerge({ ignoreUndefined: true, concatArrays: true })
// The browser or the tests are gone by then, nothing should hold it open
const SERVER_CLOSE_WAIT = 1000

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: 10 }
/**
 * The most deleting a folder waits for its files to be let go, the exit hook
 * waits for it. Each try waits longer, and per file, so it has to have an end.
 */
export const REMOVE_WAIT = 3000

/**
 * The temp folder for a run, respecting env overrides like `TMPDIR` / `TEMP`.
 */
export function tmpdir(env: Record<string, string | undefined> = process.env) {
  if (process.platform === 'win32') {
    return env.TEMP || env.TMP || os.tmpdir()
  }
  return env.TMPDIR || os.tmpdir()
}

/**
 * Delete a folder of the run, not being able to doesn't change how it went.
 * The processes of a browser can still hold its files for a while after it
 * exits on Windows.
 *
 * Not with `rmSync`, it doesn't wait between its tries, and on Windows it
 * doesn't retry a file another process still has open.
 */
export async function removeFolder(dir: string, logger: Logger = log) {
  const removing = rm(dir, REMOVE_OPTIONS).then(
    () => undefined,
    (error: Error) => `Could not delete ${dir}: ${error.message}`
  )
  // It keeps trying, it may still be gone by the time this process exits
  const failure = await withTimeout(
    removing,
    REMOVE_WAIT,
    `Stopped waiting for ${dir} to be deleted after ${REMOVE_WAIT}ms`
  )
  if (failure !== undefined) {
    logger.warn(failure)
  }
}

/**
 * {@link removeFolder} right away, for when this process exits next.
 */
export function removeFolderNow(dir: string, logger: Logger = log) {
  try {
    rmSync(dir, REMOVE_OPTIONS)
  } catch (error) {
    logger.warn(`Could not delete ${dir}: ${(error as Error).message}`)
  }
}

const COLOR_SWITCHES = new Set([
  'FORCE_COLOR',
  'NO_COLOR',
  'NODE_DISABLE_COLORS',
])

/**
 * Whether the streams of this run are TTYs and the colors their terminal
 * has, for the `process.stdout` and `process.stderr` of browsers. The color
 * depth comes from the env the tests get and leaves out the variables that
 * turn colors on or off, browsers check those in their own env like Node.js does.
 */
function stdio(
  testEnv: NodeJS.ProcessEnv,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream
) {
  // Undefined values never reach the tests, Node.js checks keys like `CI` with `in`
  const env = Object.fromEntries(
    Object.entries(testEnv).filter(
      ([key, value]) => value !== undefined && !COLOR_SWITCHES.has(key)
    )
  )
  const colorDepth = WriteStream.prototype.getColorDepth(env)
  return {
    stdout: {
      isTTY: Boolean((stdout as { isTTY?: boolean }).isTTY),
      colorDepth,
    },
    stderr: {
      isTTY: Boolean((stderr as { isTTY?: boolean }).isTTY),
      colorDepth,
    },
  }
}

/**
 * Merge `process.env` with per-run overrides; `undefined` removes a key.
 */
function buildInitialEnv(
  overrides?: Record<string, string | undefined>
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete env[key]
      } else {
        env[key] = value
      }
    }
  }
  return env
}

/**
 * What running the tests takes in a browser, in node and in workerd.
 *
 * Every run ends in `exit`, through `stop`, or in the exit hook when the CLI
 * process gets stopped. Both stop the tests first, then run the afterTests
 * hook, then clean up what the run made.
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
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
  console: Console
  colors: Colors
  log: Logger
  exitProcess: boolean
  /** Snapshot of `process.env` + `options.env` before runner/hook additions */
  protected initialEnv: Record<string, string | undefined>
  #beforeTests: Promise<unknown> | undefined
  #done: PromiseWithResolvers<RunResult>
  #runTimeout: NodeJS.Timeout | undefined

  constructor(options: Config, testFiles?: string[]) {
    const { stdout, stderr, env, exitProcess, ...rest } = options
    this.options = merge(defaultOptions, rest)
    this.options.testRunner = resolveTestRunner(
      this.options as { runner: string }
    )
    assertRunTimeout(this.options.runTimeout)
    assertNoExtension(this.options)
    this.assertOptions()
    this.options.cwd = path.resolve(this.options.cwd)
    this.stdout = stdout ?? process.stdout
    this.stderr = stderr ?? process.stderr
    this.exitProcess = Boolean(exitProcess)
    this.initialEnv = buildInitialEnv(env)
    this.colors = createColors(
      supportsColor({
        env: this.initialEnv,
        minimal: Boolean(this.options.minimal),
        stream: this.stdout as {
          isTTY?: boolean
          getColorDepth?: (env?: Record<string, string | undefined>) => number
        },
      })
    )
    this.console =
      this.stdout === process.stdout && this.stderr === process.stderr
        ? console
        : new Console({ stdout: this.stdout, stderr: this.stderr })
    this.log = createLogger(this.console, this.colors)
    this.server = undefined
    this.dir = path.join(
      tmpdir(this.initialEnv),
      `playwright-test-${randomUUID()}`
    )
    this.stopped = false
    this.beforeTestsOutput = undefined
    this.afterTestsResult = undefined
    this.#done = Promise.withResolvers<RunResult>()
    this.env = merge(JSON.parse(JSON.stringify(this.initialEnv)), {
      PW_OPTIONS: JSON.stringify(this.options),
      PW_STDIO: JSON.stringify(
        stdio(this.initialEnv, this.stdout, this.stderr)
      ),
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
   * Resolves with the result once the run and its cleanup finish.
   */
  get done(): Promise<RunResult> {
    return this.#done.promise
  }

  /**
   * Check the options only this runner cares about, before anything gets created.
   */
  assertOptions() {
    // Nothing to check by default
  }

  /**
   * Clean up when this process ends, however it does, see `#clean`. Only
   * installed when `exitProcess` is true (the CLI).
   *
   * The exit hook only runs once, and Playwright raises an interrupt again
   * when no other listener is left, so there's one more. A second interrupt
   * stops waiting for the hook, and for the tests to end, see `killTests`.
   */
  handleExit() {
    const afterTimeout = afterTestsTimeout(this.env)
    asyncExitHook((exitCode) => this.#clean(exitCode), {
      // Waiting for a beforeTests hook still running, then the afterTests one
      wait:
        2 * afterTimeout + SERVER_CLOSE_WAIT + REMOVE_WAIT + this.cleanupWait(),
    })
    let interrupted = false
    process.on('SIGINT', () => {
      if (interrupted) {
        this.killTests()
        removeFolderNow(this.dir, this.log)
        process.exit(130)
      }
      interrupted = true
    })
  }

  /**
   * Run the main body of a run and wait for it (and any early `stop()`) to
   * finish cleanup and settle {@link done}.
   */
  protected async finish(work: () => Promise<void>): Promise<RunResult> {
    if (this.exitProcess) {
      this.handleExit()
    }
    const running = work()
    // If stop() ends the run early (timeout, browser crash, external stop),
    // any late rejection from the abandoned work must not crash the host.
    running.catch(() => undefined)
    await Promise.race([running, this.#done.promise])
    return await this.#done.promise
  }

  /**
   * Fail the run when it takes too long, from the beforeTests hook on. What
   * the mode needs before that doesn't count, like downloading a browser.
   */
  startRunTimeout() {
    const ms = this.options.runTimeout
    if (ms > 0 && !this.options.debug) {
      this.#runTimeout = setTimeout(
        () => this.stop(true, runTimeoutMessage(ms)),
        ms
      )
      this.#runTimeout.unref()
    }
  }

  async runBeforeTests() {
    // A hook can return anything, and throw right away
    this.#beforeTests = new Promise((resolve) => {
      resolve(this.options.beforeTests(this.env))
    })
    this.beforeTestsOutput = await this.#beforeTests
    // The hook can change the env, like TERM, and with it the color depth
    this.env.PW_STDIO = JSON.stringify(
      stdio(this.env, this.stdout, this.stderr)
    )
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
    const timeout = afterTestsTimeout(this.env)
    const finished = await withTimeout(
      this.#beforeTests.then(
        () => true,
        () => false
      ),
      timeout,
      'timed out'
    )
    if (finished === 'timed out') {
      this.log.warn(
        `The beforeTests hook did not finish in ${timeout}ms, not running the afterTests hook.`
      )
    }
    if (finished !== true) {
      return true
    }
    return runAfterTests(
      this.options.afterTests,
      this.env,
      this.beforeTestsOutput,
      this.log
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
  async removeFiles() {
    await removeFolder(this.dir, this.log)
  }

  async #clean(exitCode: number) {
    // Whatever is still running fails from here on, it can't stop the run again
    this.stopped = true
    clearTimeout(this.#runTimeout)
    await this.stopTests()
    await this.runAfterTests()
    await this.cleanUp(exitCode)
    await closeServer(this.server, SERVER_CLOSE_WAIT)
    await this.removeFiles()
  }

  /**
   * End the run once, whatever ends it first.
   */
  async stop(fail: boolean, msg?: unknown): Promise<RunResult | undefined> {
    if (this.stopped) {
      return this.#done.promise
    }
    this.stopped = true
    return await this.exit(fail, msg)
  }

  /**
   * End the run, the after tests hook failing also fails the run.
   * When `exitProcess` is true, exits the Node.js process through `gracefulExit`.
   */
  async exit(fail: boolean, msg?: unknown): Promise<RunResult> {
    clearTimeout(this.#runTimeout)
    if (fail && msg) {
      this.log.error(msg)
    }
    await this.stopTests()
    const afterTestsPassed = await this.runAfterTests()
    const exitCode: 0 | 1 = fail || !afterTestsPassed ? 1 : 0
    if (this.exitProcess) {
      gracefulExit(exitCode)
    } else {
      await this.cleanUp(exitCode)
      await closeServer(this.server, SERVER_CLOSE_WAIT)
      await this.removeFiles()
    }
    const result: RunResult = { passed: exitCode === 0, exitCode }
    this.#done.resolve(result)
    return result
  }
}
