/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import assert, * as named from 'playwright-test/taps/node-assert'

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

console.log('EXPORTS OK')
process.exit(0)
