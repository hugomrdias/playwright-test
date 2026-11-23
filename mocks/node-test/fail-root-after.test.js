import { after, test } from '../../src/node/test.ts'

after(() => {
  throw new Error('root after throws')
})

test('passes', () => {
  // noop
})
