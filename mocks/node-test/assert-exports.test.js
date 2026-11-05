/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */

import nodeAssert from 'node:assert'
import nodeStrict, { equal as nodeStrictEqual } from 'node:assert/strict'
import nodeUtil, { inspect as nodeInspect } from 'node:util'
import { isSet } from 'node:util/types'
import bare, { strict as bareStrict } from 'assert'
import strictOnly, { equal as strictEqualNamed } from 'assert/strict'
import assert, * as named from 'playwright-test/node-assert'
import util, { inspect, promisify } from 'util'
import { isMap } from 'util/types'

const NAMES = [
  'Assert',
  'AssertionError',
  'CallTracker',
  'deepEqual',
  'deepStrictEqual',
  'doesNotMatch',
  'doesNotReject',
  'doesNotThrow',
  'equal',
  'fail',
  'ifError',
  'legacy',
  'match',
  'notDeepEqual',
  'notDeepStrictEqual',
  'notEqual',
  'notStrictEqual',
  'ok',
  'partialDeepStrictEqual',
  'rejects',
  'strict',
  'strictEqual',
  'throws',
]

for (const name of NAMES) {
  if (named[name] === undefined) {
    throw new Error(`${name} isn't exported`)
  }
}
if (Object.keys(named).filter((n) => n !== 'default').length !== NAMES.length) {
  throw new Error(`Unexpected exports: ${Object.keys(named)}`)
}

// The default and named exports are the strict ones, `legacy` is not.
assert.throws(() => assert.equal(1, '1'), { operator: 'strictEqual' })
assert.throws(() => named.equal(1, '1'), { operator: 'strictEqual' })
assert.throws(() => named.deepEqual([1], ['1']), {
  operator: 'deepStrictEqual',
})
named.legacy.equal(1, '1')
named.legacy.deepEqual([1], ['1'])
assert.strictEqual(assert, named.strict)
assert.strictEqual(assert.strict, assert)
assert.strictEqual(named.legacy.strict, assert)

// What's not implemented names itself.
assert.throws(() => new named.CallTracker(), /CallTracker is not supported/)

// What bundles resolve the bare specifiers to.
assert.strictEqual(bare, named.legacy)
assert.strictEqual(bareStrict, assert)
assert.strictEqual(strictOnly, assert)
assert.strictEqual(strictEqualNamed, assert.equal)
assert.strictEqual(util.inspect, inspect)
assert.strictEqual(util.promisify, promisify)
assert.strictEqual(isMap(new Map()), true)

// The same modules with the `node:` prefix.
assert.strictEqual(nodeAssert, named.legacy)
assert.strictEqual(nodeStrict, assert)
assert.strictEqual(nodeStrictEqual, assert.equal)
assert.strictEqual(nodeUtil, util)
assert.strictEqual(nodeInspect, inspect)
assert.strictEqual(isSet(new Set()), true)

// Plain text whatever the output is, and a diff that shows what's different.
assert.throws(
  () => assert.deepEqual({ a: 1 }, { a: 2 }),
  (/** @type {any} */ err) => {
    assert.match(err.message, /\+ {3}a: 1\n- {3}a: 2/)
    assert.doesNotMatch(err.message, new RegExp(String.fromCharCode(27)))
    assert.strictEqual(err.diff, 'simple')
    return true
  }
)

console.log('EXPORTS OK')
process.exit(0)
