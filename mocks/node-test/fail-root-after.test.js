import { after, test } from '../../src/taps/node-test.js'

after(() => {
  throw new Error('root after throws')
})

test('passes', () => {
  // noop
})
