const debug = require('debug')

const error = debug('app:error')

// biome-ignore lint/suspicious/noConsoleLog: <explanation>
console.log('\nRun before stuff')

error('testing debug in before script')
setTimeout(() => {
  // biome-ignore lint/suspicious/noConsoleLog: <explanation>
  console.log('done')
  // biome-ignore lint/style/noRestrictedGlobals: <explanation>
  self.PW_TEST.beforeEnd()
})
