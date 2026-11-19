import { exports } from 'cloudflare:workers'
import assert from 'node:assert/strict'

describe('worker with mocha', () => {
  it('calls the default export', async () => {
    const response = await exports.default.fetch('http://example.com/greet')
    assert.equal(await response.text(), 'hello world')
  })
})
