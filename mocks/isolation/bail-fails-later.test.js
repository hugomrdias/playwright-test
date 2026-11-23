// Sorts before mocha-slow, which is running by the time this fails
describe('bail fails later', () => {
  it('fails once the other files started', async () => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    throw new Error('bail-fails-later')
  })
})
