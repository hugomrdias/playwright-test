describe('mocha hangs', () => {
  it('never ends', async function () {
    this.timeout(0)
    await new Promise(() => {
      // never settles
    })
  })
})
