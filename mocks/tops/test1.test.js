import { test } from '../../src/taps/index.js'
import delay from 'delay'
import { type, is } from 'uvu/assert'
// test.before(() => {
//   console.log('before')
// })

// test.after(() => {
//   console.log('after')
// })

// test.beforeEach(() => {
//   console.log('before each')
// })

// test.afterEach(() => {
//   console.log('after each')
//   throw new Error('after each error')
// })

test('sum1', () => {
  type(() => {}, 'function')
  is(3, 3)
})

test.skip('sum2', async () => {
  await delay(100)
  type(() => {}, 'function')
  is(3, 3)
})

// test('fail sum', () => {
//   type(() => {}, 'function')
//   is(3, 4)
// })

// test('fail sum 2', () => {
//   type(() => {}, 'functions')
//   is(3, 4)
// })

// test('fail sum 3', () => {
//   equal({ a: 1, b: 2 }, { a: 2 })
// })

// test('fail sum 4', () => {
//   assert.deepStrictEqual({ a: 1, b: 2 }, { a: 2 })
// })

// test('failing test using Promises', () => {
//   // Promises can be used directly as well.
//   return new Promise((resolve, reject) => {
//     setImmediate(() => {
//       reject(new Error('this will cause the test to fail'))
//     })
//   })
// })

// test('fail sum 45', (t) => {
//   t.test('sum2', async () => {
//     await delay(100)
//     type(() => {}, 'function')
//     is(3, 3)
//   })
//   t.test('fail sum 36', (t) => {
//     t.subset({ a: 1, b: 2 }, { b: 2, a: (v) => v === 21 })
//   })
// })
