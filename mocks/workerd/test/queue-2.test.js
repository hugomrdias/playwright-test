import { env } from 'cloudflare:workers'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('queue 2 reaches the consumer of its worker', async () => {
  await env.JOBS.send('2')
  let done = null
  for (let i = 0; i < 50 && done === null; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    done = await env.KV.get('job:2')
  }
  assert.equal(done, 'done')
})
