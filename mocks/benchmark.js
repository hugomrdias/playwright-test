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
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    console.log(String(event.target))
  })
  .on('complete', function () {
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    console.log(`Fastest is ${this.filter('fastest').map('name')}`)
  })
  // run async
  .run({ async: true })
