import { env, exports } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { it } from 'node:test'

it('keeps configured vars over the inherited env', async () => {
  const response = await exports.default.fetch('http://example.com/configured')
  assert.equal(await response.text(), 'from the config')
  assert.equal(env.CONFIGURED, 'from the config')
  assert.equal(process.env.CONFIGURED, 'from the config')
})
