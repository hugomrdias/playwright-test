import fs from 'node:fs'

// Cleans up and exits with 0 when it's ended
process.on('SIGTERM', () => {
  fs.writeSync(1, 'SIGTERM HANDLED\n')
  process.exit(0)
})

describe('mocha sigterm', () => {
  it('takes a while', async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000))
  })
})
