/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
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

        // return webpack(config);

        const nodePlugin = {
            name: 'node built ins',
            setup(build) {
                build.onResolve({ filter: /^zora$/ }, (args) => {
                    return { path: path.join(__dirname, 'setup-zora.js') };
                });
                build.onResolve({ filter: /^path$/ }, (args) => {
                    return { path: require.resolve('path-browserify') };
                });
            }
        };

        fs.writeFileSync(path.join(__dirname, '../temp/in.js'), `'use strict'

        require('${require.resolve('./setup-zora.js')}')
        ${this.tests.map(t => `require('${t}')`).join('\n')}
                `);
        await esbuild.build({
            entryPoints: [path.join(__dirname, '../temp/in.js')],
            bundle: true,
            sourcemap: true,
            plugins: [nodePlugin],
            outfile: path.join(__dirname, '../temp/out.js'),
            define: {
                'process.env.INDENT': 'true',
                'process.env.RUN_ONLY': 'true',
                'PW_CWD': JSON.stringify(process.cwd())
            }
        });

        return 'out.js';
    }
}

module.exports = ZoraRunner;
