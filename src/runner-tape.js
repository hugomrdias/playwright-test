/* eslint-disable no-console */
'use strict';

const webpack = require('webpack');
const merge = require('webpack-merge');
const resolveCwd = require('resolve-cwd');
const Runner = require('./runner');
const { addWorker, defaultWebpackConfig } = require('./utils');

class TapeRunner extends Runner {
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
        const config = merge(
            defaultWebpackConfig(this.dir, this.env, this.options),
            {
                entry: [
                    require.resolve('./setup-tape.js'),
                    ...this.options.files
                ],
                resolve: { alias: { tape: resolveCwd('tape') } }

            }
        );

        return webpack(config);
    }
}

module.exports = TapeRunner;
