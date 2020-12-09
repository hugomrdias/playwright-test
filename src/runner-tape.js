/* eslint-disable no-console */
'use strict';

const webpack = require('webpack');
const merge = require('webpack-merge');
const resolveCwd = require('resolve-cwd');
const Runner = require('./runner');
const { defaultWebpackConfig } = require('./utils');

class TapeRunner extends Runner {
    compiler() {
        const config = merge(
            defaultWebpackConfig(this.dir, this.env, this.options),
            {
                entry: [require.resolve('./setup-tape.js'), ...this.tests],
                resolve: { alias: { tape: resolveCwd('tape') } }
            }
        );

        return webpack(config);
    }
}

module.exports = TapeRunner;
