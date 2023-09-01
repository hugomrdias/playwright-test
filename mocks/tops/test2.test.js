import { suite, test } from '../../src/taps/index.js'
import { type, is } from 'uvu/assert'

test('sum suite 1', () => {
  type(() => {}, 'function')
  is(3, 3)
})

test('sum suite 3', (t) => {
  t('sum suite 3.1', () => {
    is(3, 3)
  })
})
