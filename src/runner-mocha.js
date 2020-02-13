/* eslint-disable no-console */
'use strict';

const webpack = require('webpack');
const merge = require('merge-options');
const resolveCwd = require('resolve-cwd');
const Runner = require('./runner');

const runMocha = () => `
window.testsEnded = false
window.testsFailed = 0
mocha
  .run((f) =>{
    window.testsEnded = true
    window.testsFailed = f
  })
`;

const runMochaWorker = () => `
mocha
  .run((f)=>{
    postMessage(f)
  })
`;

const addWorker = filePath => `
window.testsEnded = false
window.testsFailed = 0
const w = new Worker("${filePath}");
w.onmessage = function(e) {
    window.testsEnded = true
    window.testsFailed = e.data
}
`;

class MochaRunner extends Runner {
    async runTests() {
        switch (this.options.mode) {
            case 'main': {
                await this.page.addScriptTag({
                    type: 'text/javascript',
                    url: this.file
                });

                this.page.evaluate(runMocha());
                break;
            }
            case 'worker': {
                this.page.evaluate(addWorker(this.file));
                const run = new Promise((resolve) => {
                    this.page.on('workercreated', (worker) => {
                        setTimeout(() => {
                            worker.evaluate(runMochaWorker());
                            resolve();
                        }, 1000);
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
        const options = merge({
            allowUncaught: false,
            bail: true,
            reporter: 'spec',
            timeout: 5000,
            color: true,
            ui: 'bdd'
        }, this.options.runnerOptions);

        const compiler = webpack({
            mode: 'development',
            // devtool: 'cheap-module-source-map',
            output: {
                // globalObject: 'self',
                path: this.dir,
                filename: 'bundle.[hash].js',
                devtoolModuleFilenameTemplate: info =>
                    'file:///' + encodeURI(info.absoluteResourcePath)
            },
            entry: [
                require.resolve('./setup-mocha.js'),
                ...this.options.files
            ],
            resolve: { alias: { tape: resolveCwd('mocha') } },
            node: {
                'dgram': 'empty',
                'fs': 'empty',
                'net': 'empty',
                'tls': 'empty',
                'child_process': 'empty',
                'console': false,
                'global': true,
                'process': true,
                '__filename': 'mock',
                '__dirname': 'mock',
                'Buffer': true,
                'setImmediate': true
            },
            plugins: [
                // inject options to mocha-setup.js (in "static" folder)
                new webpack.DefinePlugin({ 'process.env': { MOCHA: JSON.stringify(options) } })
            ]

        });

        return compiler;
    }
}

module.exports = MochaRunner;
