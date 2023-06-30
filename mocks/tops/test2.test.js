import { suite } from '../../src/taps/index.js'
import { type, is } from 'uvu/assert'

const { test } = suite('suite1')

test('sum suite 1', () => {
  type(() => {}, 'function')
  is(3, 3)
})
