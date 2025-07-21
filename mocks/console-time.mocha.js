const { is, ok, equal } = require('uvu/assert')
const debug = require('debug')('app')
const { good, bad } = require('./lib')
const Client = require('../src/client')

// biome-ignore lint/suspicious/noFocusedTests: <explanation>
it.only('time/timeEnd', () => {
  console.time('test')
  console.timeEnd('test')
})
