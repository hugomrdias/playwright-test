/* eslint-disable no-console */
'use strict';

const merge = require('merge-options');
const delay = require('delay');
const Runner = require('./runner');
const { build } = require('./utils');

const runMocha = () => `
mocha
  .run((f) =>{
    self.PW_TEST.end(f > 0)
  })
`;

const runMochaWorker = () => `
mocha
  .run((f)=>{
    postMessage({
        "pwRunEnded": true,
        "pwRunFailed": f > 0
    })
  })
`;

class MochaRunner extends Runner {
    constructor(options = {}) {
        super(
            merge(
                {
                    runnerOptions: {
                        allowUncaught: false,
                        bail: true,
                        reporter: 'spec',
                        timeout: 5000,
                        color: true,
                        ui: 'bdd'
                    }
                },
                options
            )
        );
    }

    async runTests() {
        await super.runTests();
        switch (this.options.mode) {
            case 'main': {
                await this.page.evaluate(runMocha());
                break;
            }
            case 'worker': {
                const run = new Promise((resolve) => {
                    this.page.on('worker', async (worker) => {
                        await delay(1000);
                        await worker.evaluate(runMochaWorker());
                        resolve();
                    });
                });

                await run;
                break;
            }
            default:
                console.error('mode not supported');
                break;
        }
    }

    compiler(mode = 'bundle') {
        return build(
            this,
            {},
            `require('${require.resolve('./setup-mocha.js').replace(/\\/g, '/')}')`,
            mode
        );
    }
}

module.exports = MochaRunner;
