/* eslint-disable no-console */
'use strict';

const fs = require('fs');
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

    async compiler() {
        // const config = merge(
        //     defaultWebpackConfig(this.dir, this.env, this.options),
        //     {
        //         entry: this.tests,
        //         resolve: { alias: { zora$: path.resolve(__dirname, 'setup-zora.js') } }
        //     }
        // );
        const inFile = path.join(__dirname, '../temp/in.js');

        fs.writeFileSync(inFile, `
${this.tests.map((t, index) => `import test${index} from '${t}'`).join('\n')}
`);

        // return webpack(config);
        const rollup = require('rollup');
        const { nodeResolve } = require('@rollup/plugin-node-resolve');
        const commonjs = require('@rollup/plugin-commonjs');
        const alias = require('@rollup/plugin-alias');
        const bundle = await rollup.rollup({
            input: [inFile],
            plugins: [
                alias({

                    entries: [{
                        find: 'zora',
                        customResolver: function(mod, importer) {
                            if (importer.includes('playwright-test/src/setup-zora.js')) {
                                return null;
                            }

                            return this.resolve(
                                path.resolve(__dirname, 'setup-zora.js'),
                                importer,
                                { skipSelf: true }
                            );
                        }
                    }]
                }),
                nodeResolve({
                    mainFields: ['browser', 'module', 'main'],
                    preferBuiltins: false

                }),
                commonjs({ requireReturnsDefault: 'auto' })
            ]
        });

        console.log(bundle.watchFiles); // an array of file names this bundle depends on
        // or write the bundle to disk
        await bundle.write({
            dir: path.join(this.dir, 'pw_tests'),
            // format: 'umd',
            exports: 'auto',
            sourcemap: 'inline'
        });

        // closes the bundle
        await bundle.close();

        return 'pw_tests/in.js';
    }
}

module.exports = ZoraRunner;
