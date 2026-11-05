import assert from 'node:assert/strict'
import { describe, it, test } from 'node:test'

describe('a suite', () => {
  it('passes in a suite', () => {
    assert.equal(1, 1)
  })
})

test('passes at the top', async (t) => {
  await t.test('passes in a subtest', () => {
    t.assert.ok(true)
  })
})
