'use strict';

const { createHarness } = require('zora');

const harness = createHarness({
    // indent: process.env.INDENT === 'true',
    // runOnly: process.env.RUN_ONLY === 'true'
    // indent: true,
    // runOnly: true
});

self.zora = harness;
module.exports = harness;
