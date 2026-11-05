import { test } from 'playwright-test/taps'

test('is too slow', () => new Promise((resolve) => setTimeout(resolve, 500)))

test(
  'has its own timeout',
  () => new Promise((resolve) => setTimeout(resolve, 100)),
  { timeout: 1000 }
)
