import { strictEqual } from 'node:assert'

describe('mocha b', () => {
  it('has globals of its own', () => {
    strictEqual(globalThis.isolationMark, undefined)
    globalThis.isolationMark = 'b'
  })
})
