import { strict as assert } from 'assert'
import { test } from '../../src/node/test.js'

/**
 * @param {() => void} fn
 * @param {string} message
 * @param {string} operator
 */
function fails(fn, message, operator) {
  assert.throws(fn, { name: 'AssertionError', message, operator })
}

test('called', (t) => {
  const fn = t.mock.fn()
  fails(
    () => t.assert.called(fn),
    'Expected mock function to have been called',
    'called'
  )
  fails(() => t.assert.called(fn, 'custom'), 'custom', 'called')
  fn()
  t.assert.called(fn)
})

test('callCount', (t) => {
  const fn = t.mock.fn()
  t.assert.callCount(fn, 0)
  fn()
  fn()
  t.assert.callCount(fn, 2)
  fails(
    () => t.assert.callCount(fn, 3),
    'Expected mock function to have been called 3 times, but it was called 2 times',
    'callCount'
  )
  fails(() => t.assert.callCount(fn, 3, 'custom'), 'custom', 'callCount')
})

test('lastCalledWith', (t) => {
  const fn = t.mock.fn()
  fails(
    () => t.assert.lastCalledWith(fn, 1),
    'Expected mock function to have been called',
    'lastCalledWith'
  )
  fn(1)
  fn(2, { a: 3 })
  t.assert.lastCalledWith(fn, 2, { a: 3 })
  assert.throws(() => t.assert.lastCalledWith(fn, 1), {
    name: 'AssertionError',
    operator: 'deepStrictEqual',
  })
})

test('nthCalledWith', (t) => {
  const fn = t.mock.fn()
  fn(1)
  fn(2)
  t.assert.nthCalledWith(fn, 1, 1)
  t.assert.nthCalledWith(fn, 2, 2)
  assert.throws(() => t.assert.nthCalledWith(fn, 1, 2), {
    name: 'AssertionError',
    operator: 'deepStrictEqual',
  })
  fails(
    () => t.assert.nthCalledWith(fn, 5, 1),
    'Expected mock function to have been called at least 5 times, but it was called 2 times',
    'nthCalledWith'
  )
})

test('only takes mock functions', (t) => {
  assert.throws(
    () =>
      t.assert.called(() => {
        // noop
      }),
    { code: 'ERR_INVALID_ARG_TYPE' }
  )
})

test('count for the plan', (t) => {
  t.plan(1)
  const fn = t.mock.fn()
  fn()
  t.assert.called(fn)
})
