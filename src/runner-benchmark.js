/* eslint-disable no-console */
'use strict';

const path = require('path');
const webpack = require('webpack');
const merge = require('webpack-merge');
const Runner = require('./runner');
const { defaultWebpackConfig } = require('./utils');

class BenchmarkRunner extends Runner {
    compiler() {
        const config = merge(
            defaultWebpackConfig(this.dir, this.env, this.options),
            {
                entry: [
                    require.resolve('./setup-bench.js'),
                    ...this.options.files
                ],
                module: { noParse: /src\/benchmark.js/ },
                resolve: { alias: { benchmark: path.resolve(__dirname, 'setup-bench.js') } }
            }
        );

        return webpack(config);
    }
}

module.exports = BenchmarkRunner;
