/* eslint-disable no-console */
'use strict';

const Runner = require('./runner');
const { build } = require('./utils');

class TapeRunner extends Runner {
    compiler(mode = 'bundle') {
        const plugin = {
            name: 'swap tape',
            setup(build) {
                build.onResolve({ filter: /^tape$/ }, () => {
                    return { path: require.resolve('fresh-tape') };
                });
            }
        };

        return build(
            this,
            { plugins: [plugin] },
            `require('${require.resolve('./setup-tape.js').replace(/\\/g, '/')}')`,
            mode
        );
    }
}

module.exports = TapeRunner;
