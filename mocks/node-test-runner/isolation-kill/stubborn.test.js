import fs from 'node:fs'
import { test } from 'node:test'

// Ignores SIGTERM and keeps writing, the runner has to kill it anyway
test('ignores SIGTERM', async () => {
  process.on('SIGTERM', () => {
    // noop
  })
  const file = process.env.STUBBORN_FILE
  fs.writeFileSync(file, 'started\n')
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    fs.appendFileSync(file, `${i}\n`)
  }
})
