import { assert, test as _test, suite } from '../../src/taps/index.js'

let test = suite('suite1')

test.before(() => {
  // biome-ignore lint/suspicious/noConsoleLog: <explanation>
  console.log('before')
})

test.after(() => {
  // biome-ignore lint/suspicious/noConsoleLog: <explanation>
  console.log('after')
})

test('test1', () => {
  assert.equal(3, 3)
})

test = suite('suite2')

test.before(() => {
  // biome-ignore lint/suspicious/noConsoleLog: <explanation>
  console.log('before')
})

test.after(() => {
  // biome-ignore lint/suspicious/noConsoleLog: <explanation>
  console.log('after')
})

test.skip('test1', () => {
  assert.equal(3, 3)
})
