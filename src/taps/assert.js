import _assert from 'assert'
import kleur from 'kleur'
import { compare, formatObj } from './utils.js'

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

export const ok = _assert.strict.ok
export const equal = _assert.strict.equal
export const notEqual = _assert.strict.notEqual
export const deepEqual = _assert.strict.deepEqual
export const notDeepEqual = _assert.strict.notDeepEqual
export const throws = _assert.strict.throws
export const doesNotThrow = _assert.strict.doesNotThrow
export const rejects = _assert.strict.rejects
export const doesNotReject = _assert.strict.doesNotReject
export const match = _assert.strict.match
export const doesNotMatch = _assert.strict.doesNotMatch
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
}
