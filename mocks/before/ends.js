// biome-ignore-all lint/suspicious/noConsole: test
// biome-ignore-all lint/style/noRestrictedGlobals: test
console.log(`before running in ${location.pathname}`)

// The tests can't start until this calls beforeEnd
setTimeout(() => {
  console.log('before done')
  self.PW_TEST.beforeEnd()
}, 200)
