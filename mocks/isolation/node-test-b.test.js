import { strictEqual } from 'node:assert'
import { test } from 'node:test'

test('node-test b has globals of its own', () => {
  strictEqual(globalThis.isolationMark, undefined)
  globalThis.isolationMark = 'b'
})
