/** biome-ignore-all lint/suspicious/noConsole: its ok */
import delay from 'delay'
import { assert, test } from '../../src/taps/index.js'

// test.before(() => {
//   console.log('before')
// })

// test.after(() => {
//   console.log('after')
// })

test.beforeEach(() => {
  console.log('before each')
})

// test.afterEach(() => {
//   console.log('after each')
//   throw new Error('after each error')
// })

test('sum1', () => {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: its ok
  assert.type(() => {}, 'function')
})

test.skip('sum2', async () => {
  await delay(100)
  // biome-ignore lint/suspicious/noEmptyBlockStatements: its ok
  assert.type(() => {}, 'function')
})

test('failing test using Promises', async () => {
  // Promises can be used directly as well.
  const p = new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error('this will cause the test to fail'))
    })
  })

  await assert.rejects(p, { message: 'this will cause the test to fail' })
})
