// @ts-nocheck
/**
 * `node:assert/strict` for browsers, bundles resolve `assert/strict` to this file.
 */
import { assert } from './assert.js'

export const {
  Assert,
  AssertionError,
  CallTracker,
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
  strict,
  strictEqual,
  throws,
} = assert.strict

export default assert.strict
