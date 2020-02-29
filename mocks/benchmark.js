/* eslint-disable no-unused-expressions */
'use strict';

const BenchmarkManager = new self.BenchmarkManager();
const suite = BenchmarkManager.createSuite();

// add tests
suite.add('RegExp#test', () => {
    /o/.test('Hello World!');
})
    .add('String#indexOf', () => {
        'Hello World!'.indexOf('o') > -1;
    })
    .add('String#match', () => {
        Boolean('Hello World!'.match(/o/));
    })
// add listeners
    .on('cycle', (event) => {
        console.log(String(event.target));
    })
    .on('complete', function() {
        console.log('Fastest is ' + this.filter('fastest').map('name'));
    })
// run async
    .run({ 'async': true });
