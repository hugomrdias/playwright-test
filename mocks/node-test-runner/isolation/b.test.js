import assert from 'node:assert/strict'
import { test } from 'node:test'

test('b does not see the global of a', () => {
  assert.equal(globalThis.isolationMark, undefined)
  globalThis.isolationMark = 'b'
})
