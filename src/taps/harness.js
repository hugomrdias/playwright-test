/* eslint-disable max-depth */
/* eslint-disable no-only-tests/no-only-tests */
/* eslint-disable no-unsafe-finally */
/* eslint-disable no-console */
import kleur from 'kleur'
import { hrtime, stack } from './utils.js'
import { assert } from './assert.js'

/**
 * @type {import("./types.js").Queue}
 */
export const TAPS_QUEUE = []
globalThis.UVU_ONLY_MODE = false

/**
 *
 * @param {import("./types.js").TestContext} ctx
 * @param {Error} err
 */
function formatError(ctx, err) {
  let out =
    '\n' +
    kleur.bgRed().bold(' FAILURE ') +
    ' ' +
    kleur.red(`"${ctx.suite ? ctx.suite + ' > ' : ''}${ctx.name}"`) +
    '\n'
  out += `${err.name}: ${err.message}` + kleur.gray(stack(err))

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
  let out = kleur.red(msg)

  out += kleur.gray(stack(err))

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
    : kleur.green('✓')
  const _time = kleur.gray(`(${time})`)
  const _msg = `${ctx.suite ? ctx.suite + ' > ' : ''}${ctx.name}`

  const msg = `${symbol} ${kleur.gray(ctx.number)} ${
    fail ? kleur.red(_msg) : ctx.skip ? kleur.yellow(_msg) : _msg
  } ${_time}`

  console.log(msg)
}

/**
 * @type {import("./types.js").Runner}
 */
async function runner(ctx, testCount) {
  const { only, tests, file, name, before, after, beforeEach, afterEach } = ctx
  const testsToRun = only.length > 0 || globalThis.UVU_ONLY_MODE ? only : tests
  let num = testCount
  let passed = 0
  let skips = 0
  /** @type {string[]} */
  const errors = []
  const total = testsToRun.length
  let skipSuite = false

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
        file,
        name: test.name,
        suite: name,
        skip: test.skip || skipSuite,
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
          await test.fn(harness(test.name), assert)
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
    return [errors, passed, skips, total]
  }
}

/**
 *
 * @param {string} name
 * @returns {import('./types.js').Harness}
 */
export function harness(name = '') {
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
    file: '',
  }

  /**
   * @type {import('./types.js').TestMethod}
   */
  function test(name, fn) {
    ctx.tests.push({ name, fn, skip: false })
  }

  test.test = test

  test.before = function (/** @type {import("./types.js").Hook} */ fn) {
    ctx.before.push(fn)
  }
  test.after = function (/** @type {import("./types.js").Hook} */ fn) {
    ctx.after.push(fn)
  }

  test.beforeEach = function (/** @type {import("./types.js").Hook} */ fn) {
    ctx.beforeEach.push(fn)
  }

  test.afterEach = function (/** @type {import("./types.js").Hook} */ fn) {
    ctx.afterEach.push(fn)
  }

  test.skip = function (
    /** @type {string} */ name,
    /** @type {import('./types.js').Fn} */ fn
  ) {
    ctx.tests.push({ name, fn, skip: true })
  }

  test.only = function (
    /** @type {string} */ name,
    /** @type {import('./types.js').Fn} */ fn
  ) {
    globalThis.UVU_ONLY_MODE = true
    ctx.only.push({ name, fn, skip: false })
  }

  TAPS_QUEUE.push(runner.bind(0, ctx))

  return test
}
