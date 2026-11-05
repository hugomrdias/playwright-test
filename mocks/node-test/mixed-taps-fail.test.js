import { test as nodeTest } from '../../src/node/test.js'
import { test as tapsTest } from '../../src/taps/index.js'

tapsTest('taps fails', () => {
  throw new Error('taps fails')
})

nodeTest('node passes', () => {
  // noop
})
