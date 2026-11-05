import { strictEqual as is } from 'node:assert/strict'
import { test } from '../../src/taps/index.js'

function helper() {
  throw new Error('boom')
}

test('assert', () => {
  is(1, 2)
})
test('throws', () => {
  helper()
})
test('rejects', async () => {
  await Promise.resolve()
  helper()
})
