/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
// Logs a value that takes a read of the thread, then keeps it busy
describe('mocha logs busy', () => {
  it('logs, then blocks the thread', function () {
    this.timeout(0)
    console.log({ request: { detail: 'DEEP VALUE' } })
    const end = Date.now() + 1800
    while (Date.now() < end) {
      // busy
    }
  })
})
