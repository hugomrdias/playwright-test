/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
// Logs a value that takes a read of the thread, then keeps it busy. Long
// enough for the timer of bail-fails-later to fire on a loaded machine,
// bail ends it before the loop does.
describe('mocha logs busy', () => {
  it('logs, then blocks the thread', function () {
    this.timeout(0)
    console.log('LOGGED BEFORE BAIL', { request: { detail: 'DEEP VALUE' } })
    const end = Date.now() + 6000
    while (Date.now() < end) {
      // busy
    }
    // Seen by the test even if the console isn't
    fetch(process.env.PW_TEST_BEACON, { mode: 'no-cors', keepalive: true })
    console.log('LOGS BUSY FINISHED')
  })
})
