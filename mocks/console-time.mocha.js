/* eslint-disable no-undef */
// eslint-disable-next-line strict
const { is, ok, equal } = require('uvu/assert')
const debug = require('debug')('app')
const { good, bad } = require('./lib')
const Client = require('../src/client')

it.only('time/timeEnd', () => {
  console.time('test')
  console.timeEnd('test')
})
