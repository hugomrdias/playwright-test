import { strict } from '../../src/node/assert.js'
import * as taps from '../../src/taps/index.js'
import { assert, equal, test } from '../../src/taps/index.js'

test('taps asserts are our node:assert/strict', () => {
  for (const [name, value] of Object.entries(strict)) {
    assert.strictEqual(
      /** @type {any} */ (assert)[name],
      value,
      `assert.${name}`
    )
    assert.strictEqual(/** @type {any} */ (taps)[name], value, name)
  }
})

test('equal is strict', () => {
  assert.throws(() => assert.equal(1, '1'), assert.AssertionError)
  assert.throws(() => equal(1, '1'), assert.AssertionError)
})

test('subset, type and instance are still there', () => {
  assert.subset({ a: 1, b: 2 }, { a: 1 })
  assert.type('a', 'string')
  assert.instance(new Error('a'), Error)
  assert.throws(() => assert.type('a', 'number'), assert.AssertionError)
})
