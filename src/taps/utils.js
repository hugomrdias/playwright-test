// eslint-disable-next-line n/no-deprecated-api
import { inspect, isRegExp } from 'util'
import { AssertionError } from 'assert'

export const IS_ENV_WITH_DOM =
  typeof window === 'object' &&
  typeof document === 'object' &&
  document.nodeType === 9

export const IS_NODE =
  typeof process !== 'undefined' &&
  process.release !== undefined &&
  process.release.name === 'node'

export const HAS_PROCESS = typeof process !== 'undefined' && 'exit' in process

export const milli = (/** @type {number[]} */ arr) =>
  (arr[0] * 1e3 + arr[1] / 1e6).toFixed(2) + 'ms'

/** @type {(now?: [number, number]) => () => string} */
let _hrtime =
  (now = [Date.now(), 0]) =>
  () =>
    (Date.now() - now[0]).toFixed(2) + 'ms'

if (IS_NODE && 'hrtime' in process) {
  _hrtime =
    (now = process.hrtime()) =>
    () =>
      milli(process.hrtime(now))
}

if ('performance' in globalThis && 'now' in globalThis.performance) {
  _hrtime =
    (now = [performance.now(), 0]) =>
    () =>
      (performance.now() - now[0]).toFixed(2) + 'ms'
}

export const hrtime = _hrtime

const IGNORE = /^\s*at.*[\s(](?:node|(internal\/[\w/]*)|(.*taps\/[\w/]*))/

/**
 * Clean up stack trace
 *
 * @param {Error} err
 */
export function stack(err) {
  if (!err.stack) {
    return ''
  }
  const idx = err.stack ? err.stack.indexOf('    at ') : 0
  let out = ''
  const arr = err.stack
    ?.slice(Math.max(0, idx))
    .replaceAll('\\', '/')
    .replaceAll('file://', '')
    .split('\n')

  for (let i = 0; i < arr.length; i++) {
    const line = arr[i].trim()
    if (line.length > 0 && !IGNORE.test(line)) {
      out += '\n    ' + line
    }
  }
  return '\n' + out + '\n'
}

/**
 * Compare two values are subset of each other. Supports compare functions.
 *
 * @param {any} expected
 * @param {any} actual
 * @returns {boolean}
 */
export function compare(expected, actual) {
  if (expected === actual) {
    return true
  }
  if (typeof actual !== typeof expected) {
    return false
  }
  if (typeof expected !== 'object' || expected === null) {
    return expected === actual
  }
  if (Boolean(expected) && !actual) {
    return false
  }

  if (Array.isArray(expected)) {
    if (typeof actual.length !== 'number') {
      return false
    }
    const aa = Array.prototype.slice.call(actual)
    // @ts-ignore
    return expected.every(function (exp) {
      // @ts-ignore
      return aa.some(function (act) {
        return compare(exp, act)
      })
    })
  }

  if (expected instanceof Date) {
    return actual instanceof Date
      ? expected.getTime() === actual.getTime()
      : false
  }

  return Object.keys(expected).every(function (key) {
    const eo = expected[key]
    const ao = actual[key]
    if (typeof eo === 'object' && eo !== null && ao !== null) {
      return compare(eo, ao)
    }
    if (typeof eo === 'function') {
      return eo(ao)
    }
    return ao === eo
  })
}

/**
 * Format an object for display in an error message.
 *
 * @param {unknown} v
 * @returns
 */
export function formatObj(v) {
  return inspect(v, {
    colors: true,
    compact: false,
    depth: Number.POSITIVE_INFINITY,
    sorted: true,
    numericSeparator: true,
  })
}

/**
 * @param {any} string
 * @param {any} regexp
 * @param {string |Error} [message]
 * @param {Function} [fn]
 * @param {string} [fnName]
 */
export function internalMatch(string, regexp, message, fn, fnName) {
  if (!isRegExp(regexp)) {
    throw new TypeError('Argument #2 must be a RegExp')
  }
  const match = fnName === 'match'
  if (typeof string !== 'string' || regexp.test(string) !== match) {
    if (message instanceof Error) {
      throw message
    }

    const generatedMessage = !message

    // 'The input was expected to not match the regular expression ' +
    message =
      message ||
      (typeof string === 'string'
        ? (match
            ? 'The input did not match the regular expression '
            : 'The input was expected to not match the regular expression ') +
          `${inspect(regexp)}. Input:\n\n${inspect(string)}\n`
        : 'The "string" argument must be of type string. Received type ' +
          `${typeof string} (${inspect(string)})`)
    const err = new AssertionError({
      actual: string,
      expected: regexp,
      message,
      operator: fnName,
      stackStartFn: fn,
    })
    err.generatedMessage = generatedMessage
    throw err
  }
}
