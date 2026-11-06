/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
const where = globalThis.navigator?.userAgent ?? 'no user agent'

console.log(`document: ${typeof document}`)
console.log(`node: ${typeof process.versions?.node}`)
console.log(`agent: ${where}`)
process.exit(0)
