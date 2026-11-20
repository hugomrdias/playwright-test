import { exports } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { it } from 'node:test'

/**
 * @param {string} path
 */
async function get(path) {
  const response = await exports.default.fetch(`http://example.com${path}`)
  return response.text()
}

it('imports text modules', async () => {
  assert.equal(await get('/template'), '<p>template</p>\n')
})

it('imports data modules', async () => {
  assert.equal(await get('/data'), 'data')
})

it('imports wasm modules', async () => {
  assert.equal(await get('/wasm'), '5')
})
