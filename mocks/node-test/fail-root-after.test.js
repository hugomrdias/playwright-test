import { after, test } from '../../src/node/test.js'

after(() => {
  throw new Error('root after throws')
})

test('passes', () => {
  // noop
})
