/* eslint-disable no-console */
'use strict';

const path = require('path');
const delay = require('delay');
const Runner = require('./runner');
const { build } = require('./utils');

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
                await this.stop(true, 'mode not supported');
                break;
        }
    }

    compiler(mode = 'bundle') {
        /**
         * @type {import('esbuild').Plugin} build
         */
        const plugin = {
            name: 'swap zora',
            setup(build) {
                build.onResolve({ filter: /^zora$/ }, (args) => {
                    if (args.importer.endsWith('playwright-test/src/setup-zora.js')) {
                        return;
                    }

                    return { path: path.join(__dirname, 'setup-zora.js') };
                });
            }
        };

        return build(this, { plugins: [plugin] }, '', mode);
    }
}

module.exports = ZoraRunner;
