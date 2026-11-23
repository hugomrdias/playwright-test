// Cleans up and exits with 0 when it's ended
process.on('SIGTERM', () => process.exit(0))

describe('mocha sigterm', () => {
  it('takes a while', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
  })
})
