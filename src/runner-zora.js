/* eslint-disable no-console */
'use strict';

const path = require('path');
const webpack = require('webpack');
const delay = require('delay');
const merge = require('webpack-merge');
const Runner = require('./runner');
const { addWorker, defaultWebpackConfig } = require('./utils');

const runZora = () => `
zora
  .report()
  .then((f) =>{
    self.pwTestController.end(!self.zora.pass)
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
        switch (this.options.mode) {
            case 'main': {
                await this.page.addScriptTag({
                    type: 'text/javascript',
                    url: this.file
                });
                await this.page.evaluate(runZora());
                break;
            }
            case 'worker': {
                this.page.evaluate(addWorker(this.file));
                const run = new Promise((resolve) => {
                    this.page.on('workercreated', async (worker) => {
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
