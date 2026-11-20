import assert from 'node:assert/strict'
import { it } from 'node:test'

it('gets the env beforeTests sets', () => {
  assert.equal(process.env.FROM_BEFORE_TESTS, 'yes')
})
