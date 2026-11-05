// @ts-nocheck
/** biome-ignore-all lint/complexity/noArguments: `arguments.length` is what tells a missing argument from `undefined`, same as Node.js */
/** biome-ignore-all lint/suspicious/noAssignInExpressions: same as Node.js */
/** biome-ignore-all lint/suspicious/noDoubleEquals: loose equality is the point */
/** biome-ignore-all lint/style/noParameterAssign: same as Node.js */
/**
 * `node:assert` for browsers, bundles resolve `assert` to this file. A port of
 * `lib/assert.js` from Node.js (MIT) on top of its `AssertionError` in `src/vendor`.
 */
import AssertionError from '../vendor/node-assertion-error.js'
import { codes } from '../vendor/node-errors.js'
import { inspect } from '../vendor/node-inspect.js'
import {
  isDeepEqual,
  isDeepStrictEqual,
  isPartialStrictEqual,
} from './comparisons.js'
import { isError } from './node-internals.js'
import { isPromise, isRegExp } from './types.js'

const NO_EXCEPTION_SENTINEL = {}
const kOptions = Symbol('options')

function innerFail(obj) {
  if (obj.message instanceof Error) {
    throw obj.message
  }
  throw new AssertionError(obj)
}

function innerOk(fn, argLen, value, message) {
  if (!value) {
    let generatedMessage = false

    if (argLen === 0) {
      generatedMessage = true
      message = 'No value argument passed to `assert.ok()`'
    } else if (message == null) {
      generatedMessage = true
      message = `The expression evaluated to a falsy value:\n\n  assert.ok(${inspect(value)})\n`
    } else if (isError(message)) {
      throw message
    }

    const err = new AssertionError({
      actual: value,
      expected: true,
      message,
      operator: '==',
      stackStartFn: fn,
    })
    err.generatedMessage = generatedMessage
    throw err
  }
}

/**
 * @param {{ diff?: 'simple' | 'full', strict?: boolean, skipPrototype?: boolean }} [options]
 *   `diff` is accepted and ignored, messages can be worded differently from Node.js.
 */
export function Assert(options) {
  if (!new.target) {
    throw new codes.ERR_CONSTRUCT_CALL_REQUIRED('Assert')
  }

  options = { strict: true, skipPrototype: false, ...options }

  if (
    options.diff !== undefined &&
    !['simple', 'full'].includes(options.diff)
  ) {
    throw new codes.ERR_INVALID_ARG_VALUE(
      'options.diff',
      options.diff,
      "must be one of: 'simple', 'full'"
    )
  }

  this.AssertionError = AssertionError
  Object.defineProperty(this, kOptions, { value: options })

  if (options.strict) {
    this.equal = this.strictEqual
    this.deepEqual = this.deepStrictEqual
    this.notEqual = this.notStrictEqual
    this.notDeepEqual = this.notDeepStrictEqual
  }
}

Assert.prototype.fail = function fail(
  actual,
  expected,
  message,
  operator,
  stackStartFn
) {
  const argsLen = arguments.length

  let internalMessage = false
  if (actual == null && argsLen <= 1) {
    internalMessage = true
    message = 'Failed'
  } else if (argsLen === 1) {
    message = actual
    actual = undefined
  } else if (argsLen === 2) {
    operator = '!='
  }

  if (message instanceof Error) {
    throw message
  }

  const err = new AssertionError({
    diff: this?.[kOptions]?.diff,
    actual,
    expected,
    operator: operator === undefined ? 'fail' : operator,
    stackStartFn: stackStartFn || fail,
    message,
  })
  if (internalMessage) {
    err.generatedMessage = true
  }
  throw err
}

Assert.prototype.ok = function ok(...args) {
  innerOk(ok, args.length, ...args)
}

Assert.prototype.equal = function equal(actual, expected, message) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (
    actual != expected &&
    (!Number.isNaN(actual) || !Number.isNaN(expected))
  ) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: '==',
      stackStartFn: equal,
    })
  }
}

Assert.prototype.notEqual = function notEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (actual == expected || (Number.isNaN(actual) && Number.isNaN(expected))) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: '!=',
      stackStartFn: notEqual,
    })
  }
}

Assert.prototype.deepEqual = function deepEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (!isDeepEqual(actual, expected)) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: 'deepEqual',
      stackStartFn: deepEqual,
    })
  }
}

Assert.prototype.notDeepEqual = function notDeepEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (isDeepEqual(actual, expected)) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: 'notDeepEqual',
      stackStartFn: notDeepEqual,
    })
  }
}

Assert.prototype.deepStrictEqual = function deepStrictEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (!isDeepStrictEqual(actual, expected, this?.[kOptions]?.skipPrototype)) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: 'deepStrictEqual',
      stackStartFn: deepStrictEqual,
    })
  }
}

Assert.prototype.notDeepStrictEqual = function notDeepStrictEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (isDeepStrictEqual(actual, expected, this?.[kOptions]?.skipPrototype)) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: 'notDeepStrictEqual',
      stackStartFn: notDeepStrictEqual,
    })
  }
}

Assert.prototype.strictEqual = function strictEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (!Object.is(actual, expected)) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: 'strictEqual',
      stackStartFn: strictEqual,
    })
  }
}

Assert.prototype.notStrictEqual = function notStrictEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (Object.is(actual, expected)) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: 'notStrictEqual',
      stackStartFn: notStrictEqual,
    })
  }
}

Assert.prototype.partialDeepStrictEqual = function partialDeepStrictEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw new codes.ERR_MISSING_ARGS('actual', 'expected')
  }
  if (!isPartialStrictEqual(actual, expected)) {
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: 'partialDeepStrictEqual',
      stackStartFn: partialDeepStrictEqual,
    })
  }
}

class Comparison {
  constructor(obj, keys, actual) {
    for (const key of keys) {
      if (key in obj) {
        if (
          actual !== undefined &&
          typeof actual[key] === 'string' &&
          isRegExp(obj[key]) &&
          obj[key].exec(actual[key]) !== null
        ) {
          this[key] = actual[key]
        } else {
          this[key] = obj[key]
        }
      }
    }
  }
}

function compareExceptionKey(actual, expected, key, message, keys, fn, name) {
  if (!(key in actual && isDeepStrictEqual(actual[key], expected[key]))) {
    if (!message) {
      // Create placeholder objects to create a nice output.
      const a = new Comparison(actual, keys)
      const b = new Comparison(expected, keys, actual)

      const err = new AssertionError({
        diff: this?.[kOptions]?.diff,
        actual: a,
        expected: b,
        operator: 'deepStrictEqual',
        stackStartFn: fn,
      })
      err.actual = actual
      err.expected = expected
      err.operator = name
      throw err
    }
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: name,
      stackStartFn: fn,
    })
  }
}

function expectedException(actual, expected, message, fn, name) {
  let generatedMessage = false
  let throwError = false

  if (typeof expected !== 'function') {
    // Handle regular expressions.
    if (isRegExp(expected)) {
      const str = String(actual)
      if (expected.exec(str) !== null) {
        return
      }

      if (!message) {
        generatedMessage = true
        message = `The input did not match the regular expression ${inspect(expected)}. Input:\n\n${inspect(str)}\n`
      }
      throwError = true
      // Handle primitives properly.
    } else if (typeof actual !== 'object' || actual === null) {
      const err = new AssertionError({
        diff: this?.[kOptions]?.diff,
        actual,
        expected,
        message,
        operator: 'deepStrictEqual',
        stackStartFn: fn,
      })
      err.operator = name
      throw err
    } else {
      // Handle validation objects.
      const keys = Object.keys(expected)
      // Special handle errors to make sure the name and the message are
      // compared as well.
      if (expected instanceof Error) {
        keys.push('name', 'message')
      } else if (keys.length === 0) {
        throw new codes.ERR_INVALID_ARG_VALUE(
          'error',
          expected,
          'may not be an empty object'
        )
      }
      for (const key of keys) {
        if (
          typeof actual[key] === 'string' &&
          isRegExp(expected[key]) &&
          expected[key].exec(actual[key]) !== null
        ) {
          continue
        }
        compareExceptionKey.call(
          this,
          actual,
          expected,
          key,
          message,
          keys,
          fn,
          name
        )
      }
      return
    }
    // Guard instanceof against arrow functions as they don't have a prototype.
    // Check for matching Error classes.
  } else if (expected.prototype !== undefined && actual instanceof expected) {
    return
  } else if (Object.prototype.isPrototypeOf.call(Error, expected)) {
    if (!message) {
      generatedMessage = true
      message = `The error is expected to be an instance of "${expected.name}". Received `
      if (isError(actual)) {
        const actualName = actual.constructor?.name || actual.name
        if (expected.name === actualName) {
          message += 'an error with identical name but a different prototype.'
        } else {
          message += `"${actualName}"`
        }
        if (actual.message) {
          message += `\n\nError message:\n\n${actual.message}`
        }
      } else {
        message += `"${inspect(actual, { depth: -1 })}"`
      }
    }
    throwError = true
  } else {
    // Check validation functions return value.
    const res = expected.call({}, actual)
    if (res !== true) {
      if (!message) {
        generatedMessage = true
        const fnName = expected.name ? `"${expected.name}" ` : ''
        message = `The ${fnName}validation function is expected to return "true". Received ${inspect(res)}`

        if (isError(actual)) {
          message += `\n\nCaught error:\n\n${actual}`
        }
      }
      throwError = true
    }
  }

  if (throwError) {
    const err = new AssertionError({
      diff: this?.[kOptions]?.diff,
      actual,
      expected,
      message,
      operator: name,
      stackStartFn: fn,
    })
    err.generatedMessage = generatedMessage
    throw err
  }
}

function getActual(fn) {
  if (typeof fn !== 'function') {
    throw new codes.ERR_INVALID_ARG_TYPE('fn', 'Function', fn)
  }
  try {
    fn()
  } catch (e) {
    return e
  }
  return NO_EXCEPTION_SENTINEL
}

function checkIsPromise(obj) {
  // Accept native ES6 promises and promises that are implemented in a similar
  // way. Do not accept thenables that use a function as `obj` and that have no
  // `catch` handler.
  return (
    isPromise(obj) ||
    (obj !== null &&
      typeof obj === 'object' &&
      typeof obj.then === 'function' &&
      typeof obj.catch === 'function')
  )
}

async function waitForActual(promiseFn) {
  let resultPromise
  if (typeof promiseFn === 'function') {
    // Return a rejected promise if `promiseFn` throws synchronously.
    resultPromise = promiseFn()
    // Fail in case no promise is returned.
    if (!checkIsPromise(resultPromise)) {
      throw new codes.ERR_INVALID_RETURN_VALUE(
        'instance of Promise',
        'promiseFn',
        resultPromise
      )
    }
  } else if (checkIsPromise(promiseFn)) {
    resultPromise = promiseFn
  } else {
    throw new codes.ERR_INVALID_ARG_TYPE(
      'promiseFn',
      ['Function', 'Promise'],
      promiseFn
    )
  }

  try {
    await resultPromise
  } catch (e) {
    return e
  }
  return NO_EXCEPTION_SENTINEL
}

const invalidErrorArg = (error) =>
  new codes.ERR_INVALID_ARG_TYPE(
    'error',
    ['Object', 'Error', 'Function', 'RegExp'],
    error
  )

// `stackStartFn.name` isn't an option for the operator, bundlers rename functions.
function expectsError(stackStartFn, name, actual, ...args) {
  let [error, message] = args
  if (typeof error === 'string') {
    if (args.length === 2) {
      throw invalidErrorArg(error)
    }
    if (typeof actual === 'object' && actual !== null) {
      if (actual.message === error) {
        throw new codes.ERR_AMBIGUOUS_ARGUMENT(
          'error/message',
          `The error message "${actual.message}" is identical to the message.`
        )
      }
    } else if (actual === error) {
      throw new codes.ERR_AMBIGUOUS_ARGUMENT(
        'error/message',
        `The error "${actual}" is identical to the message.`
      )
    }
    message = error
    error = undefined
  } else if (
    error != null &&
    typeof error !== 'object' &&
    typeof error !== 'function'
  ) {
    throw invalidErrorArg(error)
  }

  if (actual === NO_EXCEPTION_SENTINEL) {
    let details = ''
    if (error?.name) {
      details += ` (${error.name})`
    }
    details += message ? `: ${message}` : '.'
    const fnType = name === 'rejects' ? 'rejection' : 'exception'
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual: undefined,
      expected: error,
      operator: name,
      message: `Missing expected ${fnType}${details}`,
      stackStartFn,
    })
  }

  if (!error) {
    return
  }

  expectedException.call(this, actual, error, message, stackStartFn, name)
}

function hasMatchingError(actual, expected) {
  if (typeof expected !== 'function') {
    if (isRegExp(expected)) {
      return expected.exec(String(actual)) !== null
    }
    throw new codes.ERR_INVALID_ARG_TYPE(
      'expected',
      ['Function', 'RegExp'],
      expected
    )
  }
  // Guard instanceof against arrow functions as they don't have a prototype.
  if (expected.prototype !== undefined && actual instanceof expected) {
    return true
  }
  if (Object.prototype.isPrototypeOf.call(Error, expected)) {
    return false
  }
  return expected.call({}, actual) === true
}

function expectsNoError(stackStartFn, name, actual, error, message) {
  if (actual === NO_EXCEPTION_SENTINEL) {
    return
  }

  if (typeof error === 'string') {
    message = error
    error = undefined
  }

  if (!error || hasMatchingError(actual, error)) {
    const details = message ? `: ${message}` : '.'
    const fnType = name === 'doesNotReject' ? 'rejection' : 'exception'
    innerFail({
      diff: this?.[kOptions]?.diff,
      actual,
      expected: error,
      operator: name,
      message: `Got unwanted ${fnType}${details}\nActual message: "${actual?.message}"`,
      stackStartFn,
    })
  }
  throw actual
}

Assert.prototype.throws = function throws(promiseFn, ...args) {
  expectsError.call(this, throws, 'throws', getActual(promiseFn), ...args)
}

Assert.prototype.rejects = async function rejects(promiseFn, ...args) {
  expectsError.call(
    this,
    rejects,
    'rejects',
    await waitForActual(promiseFn),
    ...args
  )
}

Assert.prototype.doesNotThrow = function doesNotThrow(fn, ...args) {
  expectsNoError.call(
    this,
    doesNotThrow,
    'doesNotThrow',
    getActual(fn),
    ...args
  )
}

Assert.prototype.doesNotReject = async function doesNotReject(fn, ...args) {
  expectsNoError.call(
    this,
    doesNotReject,
    'doesNotReject',
    await waitForActual(fn),
    ...args
  )
}

Assert.prototype.ifError = function ifError(err) {
  if (err !== null && err !== undefined) {
    let message = 'ifError got unwanted exception: '
    if (typeof err === 'object' && typeof err.message === 'string') {
      if (err.message.length === 0 && err.constructor) {
        message += err.constructor.name
      } else {
        message += err.message
      }
    } else {
      message += inspect(err)
    }

    throw new AssertionError({
      diff: this?.[kOptions]?.diff,
      actual: err,
      expected: null,
      operator: 'ifError',
      message,
      stackStartFn: ifError,
    })
  }
}

function internalMatch(string, regexp, message, fn, name) {
  if (!isRegExp(regexp)) {
    throw new codes.ERR_INVALID_ARG_TYPE('regexp', 'RegExp', regexp)
  }
  const match = name === 'match'
  if (typeof string !== 'string' || (regexp.exec(string) !== null) !== match) {
    if (message instanceof Error) {
      throw message
    }

    const generatedMessage = !message

    message ||=
      typeof string === 'string'
        ? `${
            match
              ? 'The input did not match the regular expression '
              : 'The input was expected to not match the regular expression '
          }${inspect(regexp)}. Input:\n\n${inspect(string)}\n`
        : `The "string" argument must be of type string. Received type ${typeof string} (${inspect(string)})`
    const err = new AssertionError({
      diff: this?.[kOptions]?.diff,
      actual: string,
      expected: regexp,
      message,
      operator: name,
      stackStartFn: fn,
    })
    err.generatedMessage = generatedMessage
    throw err
  }
}

Assert.prototype.match = function match(string, regexp, message) {
  internalMatch.call(this, string, regexp, message, match, 'match')
}

Assert.prototype.doesNotMatch = function doesNotMatch(string, regexp, message) {
  internalMatch.call(
    this,
    string,
    regexp,
    message,
    doesNotMatch,
    'doesNotMatch'
  )
}

/**
 * Deprecated in Node.js and not implemented, using it throws.
 */
export class CallTracker {
  constructor() {
    throw new Error(
      'node:assert CallTracker is not supported in browsers by playwright-test'
    )
  }
}

const METHODS = [
  'fail',
  'equal',
  'notEqual',
  'deepEqual',
  'notDeepEqual',
  'deepStrictEqual',
  'notDeepStrictEqual',
  'strictEqual',
  'notStrictEqual',
  'partialDeepStrictEqual',
  'match',
  'doesNotMatch',
  'throws',
  'rejects',
  'doesNotThrow',
  'doesNotReject',
  'ifError',
]

/**
 * The shape of `node:assert`, with `.strict` for the one of `node:assert/strict`.
 */
function ok(...args) {
  innerOk(ok, args.length, ...args)
}

export const assert = ok

assert.ok = assert
assert.AssertionError = AssertionError
assert.Assert = Assert
assert.CallTracker = CallTracker
for (const name of METHODS) {
  assert[name] = Assert.prototype[name]
}

function strict(...args) {
  innerOk(strict, args.length, ...args)
}

assert.strict = Object.assign(strict, assert, {
  equal: assert.strictEqual,
  deepEqual: assert.deepStrictEqual,
  notEqual: assert.notStrictEqual,
  notDeepEqual: assert.notDeepStrictEqual,
})
assert.strict.strict = assert.strict

export { AssertionError }

export const strictAssert = assert.strict

export const {
  deepEqual,
  deepStrictEqual,
  doesNotMatch,
  doesNotReject,
  doesNotThrow,
  equal,
  fail,
  ifError,
  match,
  notDeepEqual,
  notDeepStrictEqual,
  notEqual,
  notStrictEqual,
  partialDeepStrictEqual,
  rejects,
  strictEqual,
  throws,
} = assert

export { ok, strictAssert as strict }

export default assert
