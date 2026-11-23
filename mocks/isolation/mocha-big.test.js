describe('mocha big', () => {
  it('prints more than a pipe holds', () => {
    process.stdout.write(`${'x'.repeat(2 * 1024 * 1024)}\nMOCHA BIG END\n`)
  })
})
