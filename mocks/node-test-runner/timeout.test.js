import { describe, it } from 'node:test'

describe('a suite', () => {
  it('is too slow', () => new Promise((resolve) => setTimeout(resolve, 500)))
})
