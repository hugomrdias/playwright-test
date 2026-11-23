import { test } from 'playwright-test/node-test'

// With --test-isolation process this is the real node:test, that takes tests
// declared after a top-level await
await new Promise((resolve) => setTimeout(resolve, 50))
test('declared after a top-level await', (t) => {
  t.assert.ok(true)
})
