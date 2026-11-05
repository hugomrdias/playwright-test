import { strictEqual as is } from 'node:assert/strict'
import { describe, it } from '../../src/node/test.js'

function helper() {
  throw new Error('boom')
}

describe('group', () => {
  it('assert', () => {
    is(1, 2)
  })
  it('throws', () => {
    helper()
  })
  it('rejects', async () => {
    await Promise.resolve()
    helper()
  })
})
