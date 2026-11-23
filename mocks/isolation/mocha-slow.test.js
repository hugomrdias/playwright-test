/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
describe('mocha slow', () => {
  it('takes a while', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    console.log('SLOW FINISHED')
  })
})
