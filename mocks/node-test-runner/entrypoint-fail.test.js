import { test } from 'playwright-test/node-test'

test('must fail on the entrypoint', (t) => {
  t.assert.equal(1, 2)
})
