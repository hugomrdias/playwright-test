import { env } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { it } from 'node:test'

it('gets the mode of cloudflare.config.ts', () => {
  assert.equal(env.MODE, process.env.EXPECTED_MODE ?? 'test')
})
