/* eslint-disable no-empty-function */
import { test } from 'uvu'
import delay from 'delay'
import { type, is } from 'uvu/assert'

test('sum', () => {
  type(() => {}, 'function')
  is(3, 3)
})

test('sum', async () => {
  await delay(100)
  type(() => {}, 'function')
  is(3, 3)
})
test.run()
