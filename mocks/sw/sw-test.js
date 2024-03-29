/* eslint-disable no-undef */
// eslint-disable-next-line strict
import { is } from 'uvu/assert'

import { KV } from './sw-globals'

describe('sw', () => {
  it('should intercept and return kv and env', async () => {
    const out = await fetch('/favicon.ico')
    const data = await out.json()
    is(data.env.browser, 'chromium')
    is(data.kv.test, KV.test)
  })
})
