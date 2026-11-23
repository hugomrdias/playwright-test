import assert from 'node:assert/strict'
import { test } from 'node:test'

test('a sets a global', () => {
  assert.equal(globalThis.isolationMark, undefined)
  globalThis.isolationMark = 'a'
})
