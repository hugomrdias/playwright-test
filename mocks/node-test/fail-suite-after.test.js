import { after, describe, it } from '../../src/node/test.js'

describe('suite', () => {
  after(() => {
    throw new Error('suite after throws')
  })
  it('passes', () => {
    // noop
  })
})
