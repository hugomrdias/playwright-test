describe('a rejection nothing handles', () => {
  it('passes by itself', async () => {
    Promise.reject(new Error('rej-boom'))
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
})
