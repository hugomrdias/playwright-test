/* eslint-disable no-console */
'use strict';

const path = require('path');
const webpack = require('webpack');
const delay = require('delay');
const merge = require('webpack-merge');
const Runner = require('./runner');
const { defaultWebpackConfig } = require('./utils');

const runZora = () => `
zora
  .report()
  .then((f) =>{
    self.PW_TEST.end(!self.zora.pass)
  })
`;

const runZoraWorker = () => `
zora
  .report()
  .then((f) =>{
    postMessage({
        "pwRunEnded": true,
        "pwRunFailed": !self.zora.pass
    })
  })
`;

class ZoraRunner extends Runner {
    async runTests() {
        await super.runTests();
        switch (this.options.mode) {
            case 'main': {
                await this.page.evaluate(runZora());
                break;
            }
            case 'worker': {
                const run = new Promise((resolve) => {
                    this.page.on('worker', async (worker) => {
                        await delay(1000);
                        await worker.evaluate(runZoraWorker());
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
        const config = merge(
            defaultWebpackConfig(this.dir, this.env, this.options),
            {
                entry: [
                    ...this.options.files
                ],
                resolve: { alias: { zora$: path.resolve(__dirname, 'setup-zora.js') } }
            }
        );

        return webpack(config);
    }
}

module.exports = ZoraRunner;
