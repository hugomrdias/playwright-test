'use strict'

const debug = require('debug')

const error = debug('app:error')

console.log('\nRun before stuff')

error('testing debug in before script')
setTimeout(() => {
  console.log('done')
  self.PW_TEST.beforeEnd()
})
