import { test as tapsTest } from '../../src/taps/index.js'
import { test as nodeTest } from '../../src/taps/node-test.js'

tapsTest('taps fails', () => {
  throw new Error('taps fails')
})

nodeTest('node passes', () => {
  // noop
})
