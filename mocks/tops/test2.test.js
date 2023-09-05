import { suite, assert, test as _test } from '../../src/taps/index.js'

let { test } = suite('suite2')

test('test1', () => {
  assert.match('foo', /foo/)
  assert.doesNotMatch('fiii', /foo/)
  assert.equal(3, 3)

  assert.type('ssss', 'string')
  assert.instance(new Date(), Date)
})

test = suite('suite3').test

test('test1', () => {
  assert.match('foo', /foo/)
  assert.doesNotMatch('fiii', /foo/)
  assert.equal(3, 3)

  assert.type('ssss', 'string')
  assert.instance(new Date(), Date)
})

test('async with events', async () => {
  const signal = AbortSignal.timeout(100)

  const p = new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      resolve(true)
    })
  })

  await p

  assert.equal(signal.reason.name, 'TimeoutError')
  assert.equal(signal.aborted, true)
})

_test('default suite', () => {
  assert.equal(3, 3)
})

test(
  'should fail if Promise never resolves :: GC',
  async () => {
    await new Promise(() => {})
  },
  { timeout: 100, skip: true }
)
