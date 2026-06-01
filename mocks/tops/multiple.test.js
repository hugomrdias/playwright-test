/** biome-ignore-all lint/suspicious/noConsole: its ok */
import { assert, suite } from '../../src/taps/index.js'

let test = suite('suite1')

test.before(() => {
  console.log('before')
})

test.after(() => {
  console.log('after')
})

test('test1', () => {
  assert.equal(3, 3)
})

test = suite('suite2')

test.before(() => {
  console.log('before')
})

test.after(() => {
  console.log('after')
})

test.skip('test1', () => {
  assert.equal(3, 3)
})
