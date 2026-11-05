/**
 * `node:assert/strict` that works in browsers and in Node.js, where it is the
 * built-in. Bundles resolve `assert` to `src/polyfills/assert.js`.
 */
import nodeAssert from 'assert'

/**
 * The shape of `node:assert`, where `equal`, `deepEqual` and their `not` variants
 * are loose.
 *
 * @type {typeof import('node:assert')}
 */
export const legacy = /** @type {any} */ (nodeAssert)

/**
 * The shape of `node:assert/strict`.
 *
 * @type {typeof import('node:assert').strict}
 */
export const strict = legacy.strict

/**
 * Deprecated in Node.js. Not implemented in browsers, using it throws.
 */
export const CallTracker = /** @type {any} */ (legacy).CallTracker

export const {
  Assert,
  AssertionError,
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
  ok,
  partialDeepStrictEqual,
  rejects,
  strictEqual,
  throws,
} = strict

export default strict
