/** biome-ignore-all lint/suspicious/noConsole: test */
console.log(`storage:${localStorage.getItem('fromBefore')}:${document.cookie}`)
process.exit(0)
