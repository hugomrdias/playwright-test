/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
describe('page order 1', () => {
  it('prints after a while', async () => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    console.log('PAGE ORDER 1')
    process.stdout.write('PAGE ORDER 1 written\n')
  })
})
