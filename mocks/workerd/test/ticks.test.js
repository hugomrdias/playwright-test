/** biome-ignore-all lint/suspicious/noConsole: tests read the ticks */
// Prints until something stops the worker
setInterval(() => {
  console.log('tick')
}, 50)
