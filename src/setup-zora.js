'use strict';

const { createHarness } = require('zora/dist/bundle/index');

const harness = createHarness({
    indent: process.env.INDENT === 'true',
    runOnly: process.env.RUN_ONLY === 'true'
});

self.zora = harness;
module.exports = harness;
