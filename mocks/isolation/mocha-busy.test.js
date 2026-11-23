/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
// Keeps its thread busy for a long time, nothing it awaits can run meanwhile
describe('mocha busy', () => {
  it('blocks the thread', function () {
    this.timeout(0)
    const end = Date.now() + 20_000
    while (Date.now() < end) {
      // busy
    }
    console.log('BUSY FINISHED')
  })
})
