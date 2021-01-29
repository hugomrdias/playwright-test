'use strict';

const { Buffer } = require('buffer');
const process = require('process/browser');

globalThis.process = process;
globalThis.Buffer = Buffer;
require('./source-map-support').install();

const { createHarness } = require('zora/dist/bundle/index');

const harness = createHarness({
    indent: process.env.INDENT === 'true',
    runOnly: process.env.RUN_ONLY === 'true'
});

self.zora = harness;
module.exports = harness;
