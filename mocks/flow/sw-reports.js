/** biome-ignore-all lint/suspicious/noConsole: test */
const env = process.env.FLOW_ENV
console.log('sw-console')
process.stdout.write('sw-stdout\n')
// biome-ignore lint/style/noRestrictedGlobals: a service worker has no window
self.addEventListener('message', (event) => {
  event.source.postMessage(env)
})
