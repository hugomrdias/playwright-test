/** biome-ignore-all lint/suspicious/noConsole: test */
console.log(`controlled:${Boolean(navigator.serviceWorker.controller)}`)
process.exit(0)
