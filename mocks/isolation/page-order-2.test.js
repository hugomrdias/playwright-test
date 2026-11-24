/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
describe('page order 2', () => {
  it('prints right away', () => {
    console.log('PAGE ORDER 2')
    process.stdout.write('PAGE ORDER 2 written\n')
  })
})
