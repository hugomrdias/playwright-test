import assert from 'node:assert/strict'
import { test } from 'node:test'
import nodeUtil from 'node:util'
import util, * as named from 'playwright-test/node-util'

test('same module as node:util', () => {
  assert.equal(util, nodeUtil)
})

test('named exports', () => {
  const { default: _, ...exports } = named
  assert.equal(Object.keys(exports).length, 16)
  for (const [name, value] of Object.entries(exports)) {
    assert.equal(value, nodeUtil[name], name)
    assert.notEqual(value, undefined, name)
  }
  assert.equal(named.inspect({ a: 1 }), '{ a: 1 }')
  assert.equal(
    named.styleText('red', 'a', { validateStream: false }),
    '\u001B[31ma\u001B[39m'
  )
  assert.equal(named.types.isDate(new Date()), true)
})
