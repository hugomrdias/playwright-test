/** biome-ignore-all lint/suspicious/noConsole: tests wait for this line */
process.on('SIGTERM', () => {
  // ignored, only a forced kill ends it
})
setInterval(() => {
  // keeps it running
}, 1000)
console.log(`pid:${process.pid}`)
