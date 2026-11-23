/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
await new Promise((resolve) => setTimeout(resolve, 300))
console.log('ORDER 1')
console.error('ORDER 1 on stderr')
