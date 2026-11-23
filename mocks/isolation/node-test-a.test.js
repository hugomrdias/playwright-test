import { strictEqual } from 'node:assert'
import { test } from 'node:test'

test('node-test a has globals of its own', () => {
  strictEqual(globalThis.isolationMark, undefined)
  globalThis.isolationMark = 'a'
})
