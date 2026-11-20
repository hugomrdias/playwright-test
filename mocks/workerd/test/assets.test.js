import { env } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { it } from 'node:test'

it('serves static assets', async () => {
  const response = await env.ASSETS.fetch('http://example.com/')
  assert.match(await response.text(), /<title>index<\/title>/)
})
