'use strict';

const { createHarness } = require('zora/dist/bundle/index');

const harness = createHarness({
    // eslint-disable-next-line no-undef
    indent: PW_TEST_ENV.INDENT === 'true',
    // eslint-disable-next-line no-undef
    runOnly: PW_TEST_ENV.RUN_ONLY === 'true'
});

self.zora = harness;
module.exports = harness;
