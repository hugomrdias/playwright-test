/* eslint-disable no-console */
'use strict';

const webpack = require('webpack');
const resolveCwd = require('resolve-cwd');
const Runner = require('./runner');

const runTape = () => `
window.testsEnded = false
window.testsFailed = 0
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

class TapeRunner extends Runner {
    async runTests() {
        switch (this.options.mode) {
            case 'main': {
                this.page.evaluate(runTape());
                await this.page.addScriptTag({
                    type: 'text/javascript',
                    url: this.file
                });

                break;
            }
            case 'worker': {
                this.page.evaluate(addWorker(this.file));
                break;
            }
            default:
                console.error('mode not supported');
                break;
        }
    }

    compiler() {
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
                require.resolve('./setup-tape.js'),
                ...this.options.files
            ],
            resolve: { alias: { tape: resolveCwd('tape') } },
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
                new webpack.DefinePlugin({ 'process.env': { TAPE_IS_WORKER: JSON.stringify(this.options.mode === 'worker') } })
            ]

        });

        return compiler;
    }
}

module.exports = TapeRunner;
