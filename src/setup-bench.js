/* eslint-disable new-cap */
'use strict';

// Run benchmarkjs in the browser https://github.com/bestiejs/benchmark.js/issues/128#issuecomment-271615298
// const process = require('process');
const _ = require('lodash');
const Benchmark = require('./benchmark');

const BenchmarkSpecial = Benchmark.runInContext({
    _,
    process
});

let runningCount = 0;

const signalFinished = () => {
    if (runningCount === 0) {
        setTimeout(() => {
            if (process.env.PW_TEST.mode === 'worker') {
                postMessage({ 'pwRunEnded': true });
            } else {
                self.PW_TEST.end();
            }
        }, 1000);
    }
};

const proxy = new Proxy(BenchmarkSpecial, {
    get(obj, prop) {
        if (prop === 'Suite') {
            const SuiteProxy = new Proxy(obj.Suite, {
                construct(target, args) {
                    const suite = new target(...args);

                    suite.on('start', () => {
                        runningCount++;
                    });
                    suite.on('complete', () => {
                        runningCount--;
                        signalFinished();
                    });

                    return suite;
                }
            });

            return SuiteProxy;
        }

        if (prop in obj) {
            return obj[prop];
        }
    }
});

self.Benchmark = proxy;
module.exports = proxy;
exports.Benchmark = proxy;
