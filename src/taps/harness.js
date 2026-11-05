/** biome-ignore-all lint/suspicious/noConsole: its ok */
import kleur from 'kleur'
import pTimeout from 'p-timeout'
import { toRegExp } from '../utils/name-pattern.js'
import { hrtime, stack } from './utils.js'

/**
 * @type {import("./types.js").Queue}
 */
export const TAPS_QUEUE = []
globalThis.TAPS_ONLY = false

/**
 * What the run was configured with, see {@link configure}.
 *
 * @type {{ namePattern: RegExp | null, timeout: number | undefined }}
 */
export const config = { namePattern: null, timeout: undefined }

/**
 * Set the options of the run that aren't declared by the tests. The test runner
 * calls this with the `--test-name-pattern` and `--test-timeout` options.
 *
 * @param {object} [options]
 * @param {string} [options.testNamePattern] - Only run tests matching this regular expression or `/expression/flags`
 * @param {number} [options.testTimeout] - Timeout of tests without their own, `0` for none
 */
export function configure({ testNamePattern, testTimeout } = {}) {
  config.namePattern =
    testNamePattern == null ? null : toRegExp(String(testNamePattern))
  config.timeout = testTimeout
}

/**
 * Whether a test matches `--test-name-pattern`, with the name of the test or of
 * any of its ancestors, on its own or joined by a space with its ancestors'.
 *
 * @param {string[]} names - The name of the test and then of its ancestors
 */
export function matchesNamePattern(names) {
  const { namePattern } = config
  return (
    namePattern === null ||
    [
      ...names,
      ...names.map((_, i) => names.slice(i).toReversed().join(' ')),
    ].some((name) => name.search(namePattern) !== -1)
  )
}

/**
 *
 * @param {import("./types.js").TestContext} ctx
 * @param {Error} err
 */
export function formatError(ctx, err) {
  let out = `\n${kleur.bgRed().bold(' FAILURE ')} ${kleur.red(`"${ctx.suite ? `${ctx.suite} > ` : ''}${ctx.name}"`)}\n`
  out += `${err.name}: ${err.message}${kleur.gray(stack(err))}`

  if (err.cause instanceof Error && err.cause.stack) {
    out += kleur.gray(
      `\n    Caused by ${err.cause.name}: ${err.cause.message}  ${stack(
        err.cause
      )
        .split('\n')
        .join('\n    ')}`
    )
  }
  // @ts-expect-error
  if (err.details) {
    // @ts-expect-error
    out += err.details
  }

  return out
}

/**
 *
 * @param {string} msg
 * @param {Error} err
 */
function formatErrorSuite(msg, err) {
  const out = `${kleur.bgRed().bold(' FAILURE ')} ${kleur.red(msg)} 
${`${err.name}: ${err.message} `} ${kleur.gray(stack(err))}
  `

  return out
}

/**
 * Log the test result.
 *
 * @param {import("./types.js").TestContext} ctx
 * @param {boolean} fail
 * @param {string} time
 */
export function log(ctx, fail, time) {
  const symbol = fail
    ? kleur.red('✘')
    : ctx.skip
      ? kleur.yellow('-')
      : kleur.green('✔')
  const _time = kleur.gray(`(${time})`)
  const _msg = `${ctx.suite ? `${ctx.suite} > ` : ''}${ctx.name}`

  const msg = `${symbol} ${kleur.gray(ctx.number)} ${
    fail ? kleur.red(_msg) : ctx.skip ? kleur.yellow(_msg) : _msg
  } ${_time}`

  console.log(msg)
}

/**
 * @type {import("./types.js").Runner}
 */
async function runner(ctx, testCount) {
  const { only, tests, name, before, after, beforeEach, afterEach } = ctx
  const testsToRun = (
    only.length > 0 || globalThis.TAPS_ONLY ? only : tests
  ).filter((test) => matchesNamePattern(name ? [test.name, name] : [test.name]))
  let num = testCount
  let passed = 0
  let skips = 0
  /** @type {string[]} */
  const errors = []
  const total = testsToRun.length
  let skipSuite = false

  if (testsToRun.length === 0) {
    return [errors, passed, skips, total]
  }

  try {
    // Before Hooks
    for (const hook of before) {
      try {
        await hook()
      } catch (error) {
        const err = /** @type {Error} */ (error)
        errors.push(formatErrorSuite(`${name}: before hook`, err))
        skipSuite = true
      }
    }

    for (const test of testsToRun) {
      num++
      /** @type {import("./types.js").TestContext} */
      const testCtx = {
        name: test.name,
        suite: name,
        skip: test.options.skip || skipSuite,
        number: num,
      }
      const timer = hrtime()
      try {
        if (testCtx.skip) {
          skips++
        } else {
          // Before Each Hooks
          for (const hook of beforeEach) {
            try {
              await hook()
            } catch (error) {
              throw new Error('beforeEach hook failed', { cause: error })
            }
          }
          await pTimeout(Promise.resolve(test.fn()), {
            milliseconds:
              test.options.timeout ??
              (config.timeout === 0
                ? Number.POSITIVE_INFINITY
                : (config.timeout ?? 5000)),
          })
          passed++

          // After Each Hooks
          for (const hook of afterEach) {
            try {
              await hook()
            } catch (error) {
              throw new Error('afterEach hook failed', { cause: error })
            }
          }
        }
        log(testCtx, false, timer())
      } catch (error) {
        const err = /** @type {Error} */ (error)
        log(testCtx, true, timer())
        errors.push(formatError(testCtx, err))

        // After Each Hooks (on error)
        for (const hook of afterEach) {
          try {
            await hook()
          } catch (error) {
            errors.push(
              formatError(
                testCtx,
                new Error('afterEach hook failed', { cause: error })
              )
            )
          }
        }
      }
    }
  } finally {
    // After Hooks
    for (const hook of after) {
      try {
        await hook()
      } catch (error) {
        const err = /** @type {Error} */ (error)
        errors.push(formatErrorSuite(`${name}: after hook`, err))
      }
    }
    // biome-ignore lint/correctness/noUnsafeFinally: its ok
    return [errors, passed, skips, total]
  }
}

/**
 *
 * @param {string} name
 * @returns {import('./types.js').Suite}
 */
export function suite(name = '') {
  /** @type {import("./types.js").SuiteContext} */
  const ctx = {
    tests: [],
    before: [],
    after: [],
    beforeEach: [],
    afterEach: [],
    only: [],
    skips: 0,
    name,
  }

  const defaultOptions = {
    skip: false,
    only: false,
  }

  /**
   * @type {import('./types.js').TestMethod}
   */
  function test(name, fn, options = defaultOptions) {
    ctx.tests.push({ name, fn, options: { ...defaultOptions, ...options } })
  }

  test.test = test

  test.before = (/** @type {import("./types.js").Hook} */ fn) => {
    ctx.before.push(fn)
  }

  test.after = (/** @type {import("./types.js").Hook} */ fn) => {
    ctx.after.push(fn)
  }

  test.beforeEach = (/** @type {import("./types.js").Hook} */ fn) => {
    ctx.beforeEach.push(fn)
  }

  test.afterEach = (/** @type {import("./types.js").Hook} */ fn) => {
    ctx.afterEach.push(fn)
  }

  /**
   * @type {import('./types.js').Suite}
   */
  test.skip = (name, fn, options = defaultOptions) => {
    ctx.tests.push({
      name,
      fn,
      options: { ...defaultOptions, ...options, skip: true },
    })
  }

  /**
   * @type {import('./types.js').Suite}
   */
  test.only = (name, fn, options = defaultOptions) => {
    globalThis.TAPS_ONLY = true
    ctx.only.push({
      name,
      fn,
      options: { ...defaultOptions, ...options, only: true },
    })
  }

  test.only.test = test.only
  test.only.skip = test.skip
  test.only.only = test.only
  test.only.after = test.after
  test.only.before = test.before
  test.only.beforeEach = test.beforeEach
  test.only.afterEach = test.afterEach

  test.skip.test = test.skip
  test.skip.skip = test.skip
  test.skip.only = test.only
  test.skip.after = () => {
    // noop
  }
  test.skip.before = () => {
    // noop
  }
  test.skip.beforeEach = () => {
    // noop
  }
  test.skip.afterEach = () => {
    // noop
  }

  TAPS_QUEUE.push(runner.bind(0, ctx))

  return test
}
