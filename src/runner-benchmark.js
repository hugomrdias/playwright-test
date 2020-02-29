/* eslint-disable no-console */
'use strict';

const webpack = require('webpack');
const Runner = require('./runner');
const { addWorker } = require('./utils');

class BenchmarkRunner extends Runner {
    async runTests() {
        switch (this.options.mode) {
            case 'main': {
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
            output: {
                path: this.dir,
                filename: 'bundle.[hash].js',
                devtoolModuleFilenameTemplate: info =>
                    'file:///' + encodeURI(info.absoluteResourcePath)
            },
            entry: [
                require.resolve('./setup-bench.js'),
                ...this.options.files
            ],
            module: { noParse: /src\/benchmark.js/ },
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
                new webpack.DefinePlugin({ 'process.env': JSON.stringify(this.env) })
            ]

        });

        return compiler;
    }
}

module.exports = BenchmarkRunner;
