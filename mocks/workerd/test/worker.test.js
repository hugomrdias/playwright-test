import { env, exports } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('worker', () => {
  it('runs in workerd', () => {
    assert.equal(navigator.userAgent, 'Cloudflare-Workers')
  })

  it('calls the default export', async () => {
    const response = await exports.default.fetch('http://example.com/greet')
    assert.equal(await response.text(), 'hello world')
  })

  it('reaches a durable object through the worker', async () => {
    const first = await exports.default.fetch('http://example.com/count')
    const second = await exports.default.fetch('http://example.com/count')
    assert.deepEqual([await first.json(), await second.json()], [1, 2])
  })

  it('calls a durable object directly', async () => {
    assert.equal(await env.COUNTER.getByName('direct').increment(), 1)
  })

  it('uses kv', async () => {
    await env.KV.put('key', 'value')
    assert.equal(await env.KV.get('key'), 'value')
  })
})
