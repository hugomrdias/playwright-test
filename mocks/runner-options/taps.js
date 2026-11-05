import { suite, test } from 'playwright-test/taps'

const a = suite('suite a')
const b = suite('suite b')

test('alpha top', () => {
  // noop
})

a('alpha one', () => {
  // noop
})

a('beta', () => {
  // noop
})

b('alpha two', () => {
  // noop
})
