import { exports } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { it } from 'node:test'

it('loads the worker with the env of the run', async () => {
  const response = await exports.default.fetch('http://example.com/env')
  assert.equal(await response.text(), 'test')
})
