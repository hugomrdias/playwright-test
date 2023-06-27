/* eslint-disable no-empty-function */

import { suite } from 'uvu'
import delay from 'delay'
import { type, is } from 'uvu/assert'

const test = suite('suite')

test('sum', () => {
  type(() => {}, 'function')
  is(3, 3)
})

test('sum', async () => {
  await delay(2000)
  type(() => {}, 'function')
  is(3, 3)
})
test.run()
