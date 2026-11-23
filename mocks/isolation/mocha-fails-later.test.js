describe('mocha fails later', () => {
  it('fails once the other files started', async () => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    throw new Error('mocha-fails-later')
  })
})
