/* eslint-disable no-unused-expressions */
'use strict'

// const Benchmark = require('benchmark')

import Benchmark from 'benchmark'

const suite = new Benchmark.Suite()

// add tests
suite
  .add('RegExp#test', () => {
    ;/o/.test('Hello World!')
  })
  .add('String#indexOf', () => {
    'Hello World!'.indexOf('o') > -1
  })
  .add('String#match', () => {
    Boolean('Hello World!'.match(/o/))
  })
  // add listeners
  .on('cycle', (event) => {
    console.log(String(event.target))
  })
  .on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'))
  })
  // run async
  .run({ async: true })
