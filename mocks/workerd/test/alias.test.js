import assert from 'node:assert/strict'
import { it } from 'node:test'
import { value } from 'dep2'

it('resolves non-built-in aliases containing digits', () => {
  assert.equal(value, 'from-alias')
})
