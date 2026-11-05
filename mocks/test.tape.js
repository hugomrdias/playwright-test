import debug from 'debug'
import test from 'tape'

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

test('timing test 2', (t) => {
  t.plan(2)

  t.equal(typeof Date.now, 'function')
  const start = Date.now()

  setTimeout(() => {
    // timers use a monotonic clock, Date.now() can lag it by up to 1ms
    t.ok(Date.now() - start >= 99)
  }, 100)
})

test('test using promises', async (t) => {
  function run() {
    return Promise.resolve(true)
  }
  const result = await run()
  t.ok(result)
})
