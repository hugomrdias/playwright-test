describe('mocha corked', () => {
  it('fails with stdout corked', () => {
    process.stdout.cork()
    throw new Error('mocha-corked')
  })
})
