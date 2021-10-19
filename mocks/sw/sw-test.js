/* eslint-disable no-undef */
// eslint-disable-next-line strict
const { is } = require('uvu/assert')

const { KV } = require('./sw-globals')

describe('sw', () => {
  it('should intercept and return kv and env', async () => {
    const out = await fetch('/favicon.ico')
    const data = await out.json()
    is(data.env.browser, 'chromium')
    is(data.kv.test, KV.test)
  })
})
