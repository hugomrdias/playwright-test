import type { Server } from 'node:http'
import { WriteStream } from 'node:tty'
import { fileURLToPath } from 'node:url'
import { gracefulExit } from 'exit-hook'
import { mkdirSync } from 'fs'
// @ts-expect-error
import mergeOptions from 'merge-options'
import { nanoid } from 'nanoid'
import path from 'path'
// @ts-expect-error
import { premove } from 'premove/sync'
import type { Config, RunnerEnv, RunnerOptions } from './types.ts'
import {
  assertRunTimeout,
  defaultOptions,
  findTests,
  log,
  resolveTestRunner,
  runAfterTests,
} from './utils/index.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const merge = mergeOptions.bind({ ignoreUndefined: true, concatArrays: true })

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
 */
export class BaseRunner {
  options: RunnerOptions
  server: Server | undefined
  dir: string
  stopped: boolean
  beforeTestsFinished: boolean
  beforeTestsOutput: unknown
  afterTestsResult: Promise<boolean> | undefined
  env: RunnerEnv
  tests: string[]

  constructor(options: Config, testFiles?: string[]) {
    this.options = merge(defaultOptions, options)
    this.options.testRunner = resolveTestRunner(
      this.options as { runner: string }
    )
    assertRunTimeout(this.options.runTimeout)
    this.assertOptions()
    this.options.cwd = path.resolve(this.options.cwd)
    this.server = undefined
    this.dir = path.join(__dirname, '../.tmp', nanoid())
    this.stopped = false
    this.beforeTestsFinished = false
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
      // Not with `stop`, under --debug it would wait with nothing to debug
      this.stopped = true
      log.error('No test files were found.')
      gracefulExit(1)
      return
    }

    mkdirSync(this.dir, {
      recursive: true,
    })
  }

  /**
   * Check the options only this runner cares about, before anything gets created.
   */
  assertOptions() {
    // Nothing to check by default
  }

  async runBeforeTests() {
    this.beforeTestsOutput = await this.options.beforeTests(this.env)
    // The hook can change the env, like TERM, and with it the color depth
    this.env.PW_STDIO = JSON.stringify(stdio(this.env))
    this.beforeTestsFinished = true
  }

  /**
   * Run the after tests hook once, `stop` needs its result for the exit code and
   * when this process gets stopped only the exit hook gets to run it. It's the
   * other half of `beforeTests`, so not without one that finished.
   */
  runAfterTests() {
    this.afterTestsResult ??= this.beforeTestsFinished
      ? runAfterTests(this.options.afterTests, this.env, this.beforeTestsOutput)
      : Promise.resolve(true)
    return this.afterTestsResult
  }

  /**
   * Delete the files of this run, not being able to doesn't change how it went.
   */
  removeFiles() {
    try {
      premove(this.dir)
    } catch (error) {
      log.warn(`Could not delete ${this.dir}: ${(error as Error).message}`)
    }
  }

  /**
   * End the process, the after tests hook failing also fails the run.
   */
  async exit(fail: boolean, msg?: unknown) {
    if (fail && msg) {
      log.error(msg)
    }

    const afterTestsPassed = await this.runAfterTests()
    gracefulExit(fail || !afterTestsPassed ? 1 : 0)
  }
}
