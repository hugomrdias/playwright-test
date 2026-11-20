import assert from 'node:assert/strict'
import { it } from 'node:test'

it('fails', () => {
  assert.equal(1, 2)
  return 1
})
