import { describe, it, test } from 'node:test'

test('finishes', () => {
  // noop
})

describe('a suite', () => {
  it('never settles', () =>
    new Promise(() => {
      // never resolves
    }))
})
