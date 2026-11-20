import { exports } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { it } from 'node:test'

it('greets with the configured greeting', async () => {
  const response = await exports.default.fetch('http://example.com/greet')
  assert.equal(await response.text(), `${process.env.EXPECTED_GREETING} world`)
})
