'use strict';

const { createHarness } = require('zora/dist/bundle/index');

const harness = createHarness({
    // eslint-disable-next-line no-undef
    indent: process.env.INDENT === 'true',
    // eslint-disable-next-line no-undef
    runOnly: process.env.RUN_ONLY === 'true'
});

self.zora = harness;
module.exports = harness;
