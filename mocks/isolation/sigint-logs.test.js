/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
// Sorts after mocha-hangs, what it prints waits for it. Then it tells the test.
describe('sigint logs', () => {
  it('logs, then calls the test', async () => {
    console.log('SIGINT LOGS WRITTEN')
    await fetch(process.env.PW_TEST_BEACON)
  })
})
