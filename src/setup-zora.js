'use strict'

const { createHarness } = require('zora')

const harness = createHarness({
  // eslint-disable-next-line no-undef
  indent: process.env.INDENT === 'true',
  // eslint-disable-next-line no-undef
  runOnly: process.env.RUN_ONLY === 'true',
})

// @ts-ignore
self.zora = harness
module.exports = harness
