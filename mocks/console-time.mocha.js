/** biome-ignore-all lint/suspicious/noConsole: its ok */
/** biome-ignore-all lint/suspicious/noFocusedTests: its ok */
it.only('time/timeEnd', () => {
  console.time('test')
  console.timeEnd('test')
})
