// biome-ignore lint/suspicious/noFocusedTests: <explanation>
it.only('time/timeEnd', () => {
  console.time('test')
  console.timeEnd('test')
})
