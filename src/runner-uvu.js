/* eslint-disable no-console */
'use strict';

const webpack = require('webpack');
const merge = require('webpack-merge');
const strip = require('strip-ansi');
const Runner = require('./runner');
const { defaultWebpackConfig } = require('./utils');

const run = pass => `
self.PW_TEST.end(${pass})
`;

class UvuRunner extends Runner {
    async runTests() {
        await super.runTests();

        let total = 0;
        let passed = 0;

        this.page.on('console', async (msg) => {
            const txt = msg.text();

            if (txt.includes('  Total: ')) {
                total = Number(txt.replace('Total:', '').trim());
            }
            if (txt.includes('  Passed: ')) {
                passed = Number(strip(txt.replace('Passed:', '').trim()));
                await this.page.evaluate(run(total !== passed));
            }
        });
    }

    compiler() {
        const config = merge(
            defaultWebpackConfig(this.dir, this.env, this.options),
            {
                entry: [
                    ...this.options.files
                ]
            }
        );

        return webpack(config);
    }
}

module.exports = UvuRunner;
