const debug = require('debug')

const error = debug('app:error')

// biome-ignore lint/suspicious/noConsole: test
console.log('\nRun before stuff')

error('testing debug in before script')
setTimeout(() => {
  // biome-ignore lint/suspicious/noConsole: test
  console.log('done')
  // biome-ignore lint/style/noRestrictedGlobals: test
  self.PW_TEST.beforeEnd()
})
