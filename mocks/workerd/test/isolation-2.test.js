import { env, exports } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('isolation 2 has a workerd of its own', async () => {
  assert.equal(globalThis.isolationMark, undefined)
  globalThis.isolationMark = '2'
  // Its own Durable Objects, through the worker and directly
  const response = await exports.default.fetch('http://example.com/count')
  assert.equal(await response.json(), 1)
  assert.equal(await env.COUNTER.getByName('shared').increment(), 2)
  // KV starts empty for each file
  assert.equal(await env.KV.get('isolation'), null)
  await env.KV.put('isolation', '2')
})
