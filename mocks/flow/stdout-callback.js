/** biome-ignore-all lint/suspicious/noConsole: test */
const returned = process.stdout.write('written\n', () => {
  console.log(`callback:${returned}`)
  process.exit(0)
})
