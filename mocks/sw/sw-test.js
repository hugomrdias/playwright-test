/* eslint-disable no-undef */
// eslint-disable-next-line strict
const assert = require('assert')

describe('sw', () => {
  it('should intercept and return kv and env"', async () => {
    const out = await fetch('/favicon.ico')
    const data = await out.json()

    assert.strictEqual(data.env.browser, 'chromium')
    assert.strictEqual(data.kv.test, 'value')
  })
})
