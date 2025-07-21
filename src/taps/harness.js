import kleur from 'kleur'
import pTimeout from 'p-timeout'
import { hrtime, stack } from './utils.js'

/**
 * @type {import("./types.js").Queue}
 */
export const TAPS_QUEUE = []
globalThis.TAPS_ONLY = false

/**
 *
 * @param {import("./types.js").TestContext} ctx
 * @param {Error} err
 */
function formatError(ctx, err) {
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
  // @ts-ignore
  if (err.details) {
    // @ts-ignore
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
function log(ctx, fail, time) {
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

  // biome-ignore lint/suspicious/noConsoleLog: <explanation>
  console.log(msg)
}

/**
 * @type {import("./types.js").Runner}
 */
async function runner(ctx, testCount) {
  const { only, tests, name, before, after, beforeEach, afterEach } = ctx
  const testsToRun = only.length > 0 || globalThis.TAPS_ONLY ? only : tests
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
          // @ts-ignore
          await pTimeout(test.fn(), {
            milliseconds: test.options.timeout,
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
    // biome-ignore lint/correctness/noUnsafeFinally: <explanation>
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
    timeout: 5000,
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
