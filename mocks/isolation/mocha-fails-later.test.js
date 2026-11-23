import fs from 'node:fs'

describe('mocha fails later', () => {
  it('fails once mocha-sigterm is ready', async function () {
    this.timeout(20_000)
    while (!fs.existsSync(process.env.PW_TEST_READY)) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error('mocha-fails-later')
  })
})
