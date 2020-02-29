'use strict';

// Run benchmarkjs in the browser https://github.com/bestiejs/benchmark.js/issues/128#issuecomment-271615298
// const process = require('process');
const _ = require('lodash');
const benchmark = require('./benchmark');

const Benchmark = benchmark.runInContext({
    _,
    process
});

class BenchmarkManager {
    constructor() {
        this.suites = [];
        this.runningCount = 0;
    }

    createSuite(name) {
        const suite = new Benchmark.Suite(name);

        suite.on('complete', () => {
            this.runningCount--;
            if (this.runningCount === 0) {
                this.signalFinished();
            }
        });
        suite.on('start', () => {
            this.runningCount++;
        });
        this.suites.push(suite);

        return suite;
    }

    signalFinished() {
        setTimeout(() => {
            if (process.env.PW_TEST.mode === 'worker') {
                postMessage({ 'pwRunEnded': true });
            } else {
                self.pwTestController.end();
            }
        }, 1000);
    }
}

self.Benchmark = Benchmark;
self.BenchmarkManager = BenchmarkManager;
module.exports = BenchmarkManager;
