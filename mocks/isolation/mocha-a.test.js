import { strictEqual } from 'node:assert'

describe('mocha a', () => {
  it('has globals of its own', () => {
    strictEqual(globalThis.isolationMark, undefined)
    globalThis.isolationMark = 'a'
  })
})
