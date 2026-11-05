import test from 'playwright-test/taps/node-test'

test('loose equal', (t) => {
  t.assert.equal(1, '1')
})

test('strict method', (t) => {
  t.assert.strictEqual(1, '1')
})

test('nested URL', (t) => {
  t.assert.deepEqual(
    { url: new URL('http://a.com') },
    { url: new URL('http://b.com') }
  )
})

test('partial', (t) => {
  t.assert.partialDeepStrictEqual({ a: 1, b: 2 }, { a: 1 })
})

test('throws operator', (t) => {
  t.assert.throws(() => {
    throw new TypeError('boom')
  }, RangeError)
})
