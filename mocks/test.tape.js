/* eslint-disable no-undef */
// eslint-disable-next-line strict
const test = require('tape')
const debug = require('debug')

const error = debug('app:error')

test('timing test', (t) => {
  t.equal(typeof Date.now, 'function')
  t.end()
})

test('controller exists', (t) => {
  error('testing debug')
  t.equal(typeof Date.now, 'function')
  t.end()
})

test('timing test 2', function (t) {
  t.plan(2)

  t.equal(typeof Date.now, 'function')
  var start = Date.now()

  setTimeout(function () {
    t.ok(Date.now() - start >= 100)
  }, 100)
})

test('test using promises', async function (t) {
  async function run() {
    return true
  }
  const result = await run()
  t.ok(result)
})
