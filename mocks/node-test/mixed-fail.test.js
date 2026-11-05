import { test as nodeTest } from '../../src/node/test.js'
import { suite, test as tapsTest } from '../../src/taps/index.js'

tapsTest('taps passes', () => {
  // noop
})

nodeTest('node fails', () => {
  throw new Error('node fails')
})

suite('taps named')('taps named passes', () => {
  // noop
})
