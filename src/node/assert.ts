/**
 * `node:assert/strict` that works in browsers and in Node.js, where it is the
 * built-in. Bundles resolve `assert` to `src/polyfills/assert.js`.
 */
import nodeAssert from 'assert'

/**
 * The shape of `node:assert`, where `equal`, `deepEqual` and their `not` variants
 * are loose.
 */
export const legacy: typeof import('node:assert') = nodeAssert

/**
 * The shape of `node:assert/strict`.
 */
export const strict: typeof import('node:assert').strict = legacy.strict

/**
 * Deprecated in Node.js. Not implemented in browsers, using it throws.
 */
export const CallTracker = (legacy as { CallTracker?: unknown }).CallTracker

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
