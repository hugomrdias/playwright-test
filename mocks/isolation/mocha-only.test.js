/** biome-ignore-all lint/suspicious/noFocusedTests: it checks what .only filters */
describe('mocha only', () => {
  it.only('is the only one', () => {
    // passes
  })
})
