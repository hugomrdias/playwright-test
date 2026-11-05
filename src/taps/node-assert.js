/**
 * `node:assert/strict` that works in browsers and in Node.js, where it is the
 * built-in. Bundles resolve `assert` to the polyfill, which only `AssertionError`
 * comes from, see `./node-assert-polyfill.js`.
 */
import nodeAssert from 'assert'
import { assert as polyfill } from './node-assert-polyfill.js'
import { IS_NODE } from './utils.js'

/**
 * The shape of `node:assert`, where `equal`, `deepEqual` and their `not` variants
 * are loose.
 *
 * @type {typeof import('node:assert')}
 */
export const legacy = /** @type {any} */ (IS_NODE ? nodeAssert : polyfill)

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
