import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('a suite', () => {
  it('must fail', () => {
    assert.equal(1, 2)
  })
})
