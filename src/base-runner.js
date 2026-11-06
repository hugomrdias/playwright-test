import { fileURLToPath } from 'node:url'
import { gracefulExit } from 'exit-hook'
import { mkdirSync } from 'fs'
// @ts-expect-error
import mergeOptions from 'merge-options'
import { nanoid } from 'nanoid'
import path from 'path'
// @ts-expect-error
import { premove } from 'premove/sync'
import {
  assertRunTimeout,
  defaultOptions,
  findTests,
  log,
  resolveTestRunner,
  runAfterTests,
} from './utils/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const merge = mergeOptions.bind({ ignoreUndefined: true, concatArrays: true })

/**
 * What running the tests takes in a browser and in node.
 */
export class BaseRunner {
  /**
   *
   * @param {import('./types').Config} options
   * @param {string[]} [testFiles]
   */
  constructor(options, testFiles) {
    /** @type {import('./types').RunnerOptions} */
    this.options = merge(defaultOptions, options)
    this.options.testRunner = resolveTestRunner(
      /** @type {{ runner: string }} */ (this.options)
    )
    assertRunTimeout(this.options.runTimeout)
    this.assertOptions()
    this.options.cwd = path.resolve(this.options.cwd)
    /** @type {import('polka').Polka["server"] | undefined} */
    this.server = undefined
    this.dir = path.join(__dirname, '../.tmp', nanoid())
    this.stopped = false
    this.beforeTestsFinished = false
    /** @type {unknown} */
    this.beforeTestsOutput = undefined
    /** @type {Promise<boolean> | undefined} */
    this.afterTestsResult = undefined
    /** @type {import('./types').RunnerEnv} */
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
    } catch (/** @type {any} */ error) {
      log.warn(`Could not delete ${this.dir}: ${error.message}`)
    }
  }

  /**
   * End the process, the after tests hook failing also fails the run.
   *
   * @param {boolean} fail
   * @param {string | undefined} [msg]
   */
  async exit(fail, msg) {
    if (fail && msg) {
      log.error(msg)
    }

    const afterTestsPassed = await this.runAfterTests()
    gracefulExit(fail || !afterTestsPassed ? 1 : 0)
  }
}
