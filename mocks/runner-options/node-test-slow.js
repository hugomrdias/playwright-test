import { test } from 'playwright-test/node-test'

test('is too slow', () => new Promise((resolve) => setTimeout(resolve, 200)))

test('has its own timeout', { timeout: 1000 }, () => {
  return new Promise((resolve) => setTimeout(resolve, 100))
})
