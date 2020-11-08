/* eslint-disable no-console */
'use strict';

const webpack = require('webpack');
const merge = require('merge-options');
const delay = require('delay');
const resolveCwd = require('resolve-cwd');
const webpackMerge = require('webpack-merge');
const Runner = require('./runner');
const { addWorker, defaultWebpackConfig } = require('./utils');

const runMocha = () => `
mocha
  .run((f) =>{
    self.pwTestController.end(f > 0)
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
        super(merge({
            runnerOptions: {
                allowUncaught: false,
                bail: true,
                reporter: 'spec',
                timeout: 5000,
                color: true,
                ui: 'bdd'
            }
        }, options));
    }

    async runTests() {
        await super.runTests();
        switch (this.options.mode) {
            case 'main': {
                await this.page.addScriptTag({
                    type: 'text/javascript',
                    url: this.file
                });

                await this.page.evaluate(runMocha());
                break;
            }
            case 'worker': {
                await this.page.evaluate(addWorker(this.file));
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

    compiler() {
        const config = webpackMerge(
            defaultWebpackConfig(this.dir, this.env, this.options),
            {
                entry: [
                    require.resolve('./setup-mocha.js'),
                    ...this.options.files
                ],
                resolve: { alias: { 'mocha/mocha': resolveCwd('mocha/mocha.js') } }
            }
        );

        return webpack(config);
    }
}

module.exports = MochaRunner;
