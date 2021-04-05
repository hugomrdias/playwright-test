/* eslint-disable no-undef */
// eslint-disable-next-line strict
const test = require('tape')

test('timing test 2', (t) => {
  t.plan(1)

  t.equal(typeof Date.now, 'function')
})
