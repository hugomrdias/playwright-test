import _assert from 'assert'
import kleur from 'kleur'
import { compare, formatObj, internalMatch } from './utils.js'

/**
 * @typedef {import('./types.js').TypeMap} TypeMap
 */

/**
 * Assert that actual is a subset of expected.
 *
 * @example
 * ```js
 * // Supports compare functions
 * subset({ a: 1, b: 2 }, { b: 2, a: (actual) => actual === 1 })
 * ```
 *
 * @template T
 * @param {unknown} actual
 * @param {T} expected
 * @param {string} [msg]
 *
 * @returns {asserts actual is Partial<T>} - returns true if actual is a subset of expected
 */
export function subset(actual, expected, msg) {
  const pass = compare(expected, actual)
  if (!pass) {
    throw new _assert.AssertionError({
      message:
        msg ||
        `Expected a subset of actual:
${kleur.green('+ actual')} ${kleur.red('- expected')}

${kleur.green('+')} ${formatObj(actual)}
${kleur.red('-')} ${formatObj(expected)}`,
      actual,
      expected,
      operator: 'subset',
      stackStartFn: subset,
    })
  }
}

/**
 * Expects the `string` input to match the regular expression.
 *
 * ```js
 * import assert from 'assert/strict';
 *
 * assert.match('I will fail', /pass/);
 * // AssertionError [ERR_ASSERTION]: The input did not match the regular ...
 *
 * assert.match(123, /pass/);
 * // AssertionError [ERR_ASSERTION]: The "string" argument must be of type string.
 *
 * assert.match('I will pass', /pass/);
 * // OK
 * ```
 *
 * If the values do not match, or if the `string` argument is of another type than`string`, an `AssertionError` is thrown with a `message` property set equal
 * to the value of the `message` parameter. If the `message` parameter is
 * undefined, a default error message is assigned. If the `message` parameter is an
 * instance of an `Error` then it will be thrown instead of the `AssertionError`.
 *
 * @since v13.6.0, v12.16.0
 *
 * @param {string} str - string to test
 * @param {RegExp} regexp - regular expression to test against
 * @param {string | Error} [message] - error message to throw if test fails
 */
export function _match(str, regexp, message) {
  internalMatch(str, regexp, message, _match, 'match')
}

/**
 * Expects the `string` input not to match the regular expression.
 *
 * ```js
 * import assert from 'assert/strict';
 *
 * assert.doesNotMatch('I will fail', /fail/);
 * // AssertionError [ERR_ASSERTION]: The input was expected to not match the ...
 *
 * assert.doesNotMatch(123, /pass/);
 * // AssertionError [ERR_ASSERTION]: The "string" argument must be of type string.
 *
 * assert.doesNotMatch('I will pass', /different/);
 * // OK
 * ```
 *
 * If the values do match, or if the `string` argument is of another type than`string`, an `AssertionError` is thrown with a `message` property set equal
 * to the value of the `message` parameter. If the `message` parameter is
 * undefined, a default error message is assigned. If the `message` parameter is an
 * instance of an `Error` then it will be thrown instead of the `AssertionError`.
 *
 * @since v13.6.0, v12.16.0
 *
 * @param {string} str - string to test
 * @param {RegExp} regexp - regular expression to test against
 * @param {string | Error} [message] - error message to throw if test fails
 */
export function _doesNotMatch(str, regexp, message) {
  internalMatch(str, regexp, message, _doesNotMatch, 'doesNotMatch')
}

/**
 * Assert that actual is the same type as expected.
 *
 * @template {keyof TypeMap} [T= keyof TypeMap]
 * @param {any} actual
 * @param {T} expected
 * @param {string} [msg]
 *
 * @returns {asserts actual is TypeMap[T]} - returns true if actual and expected are the same type
 */
export function type(actual, expected, msg) {
  const tmp = typeof actual
  if (tmp !== expected) {
    throw new _assert.AssertionError({
      message:
        msg ||
        `Expected type ${expected} but got ${tmp}
${kleur.red('Actual')} ${formatObj(actual)}`,
      actual,
      expected,
      operator: 'type',
      stackStartFn: type,
    })
  }
}

/**
 * Assert that actual is instance of expected.
 *
 * @template {Function} T extends Function
 * @param {any} actual
 * @param {T} expected
 * @param {string} [msg]
 *
 * @returns {asserts actual is T} - returns true if actual and expected are the same type
 */
export function instance(actual, expected, msg) {
  const name = `\`${expected.name || expected.constructor.name}\``
  if (!(actual instanceof expected)) {
    throw new _assert.AssertionError({
      message:
        msg ||
        `Expected type actual to be instance of ${name}
${kleur.red('Actual')} ${formatObj(actual)}`,
      actual,
      expected,
      operator: 'instance',
      stackStartFn: instance,
    })
  }
}

export const ok = _assert.strict.ok
export const equal = _assert.strict.equal
export const notEqual = _assert.strict.notEqual
export const deepEqual = _assert.strict.deepEqual
export const notDeepEqual = _assert.strict.notDeepEqual
export const throws = _assert.strict.throws
export const doesNotThrow = _assert.strict.doesNotThrow
export const rejects = _assert.strict.rejects
export const doesNotReject = _assert.strict.doesNotReject
export const match = 'match' in _assert.strict ? _assert.strict.match : _match
export const doesNotMatch =
  'doesNotMatch' in _assert.strict ? _assert.strict.doesNotMatch : _doesNotMatch
export const ifError = _assert.strict.ifError
export const fail = _assert.strict.fail

/** @type {import('./types.js').Assert} */
export const assert = {
  ok,
  equal,
  notEqual,
  deepEqual,
  notDeepEqual,
  throws,
  doesNotThrow,
  rejects,
  doesNotReject,
  match,
  doesNotMatch,
  ifError,
  fail,
  subset,
  type,
  instance,
}
