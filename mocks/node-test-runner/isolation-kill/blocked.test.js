import fs from 'node:fs'
import { test } from 'node:test'

// Ignores SIGTERM and never gives its event loop a chance again
test('blocks', () => {
  process.on('SIGTERM', () => {
    // noop
  })
  fs.writeFileSync(process.env.STUBBORN_FILE, String(process.pid))
  const end = Date.now() + 30_000
  while (Date.now() < end) {
    // busy
  }
})
