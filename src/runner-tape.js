/* eslint-disable no-console */
'use strict'

const Runner = require('./runner')
const { build } = require('./utils')

/**
 * @typedef {import('esbuild').Plugin} EsbuildPlugin
 */

class TapeRunner extends Runner {
  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<string>} file to be loaded in the page
   */
  compiler(mode = 'bundle') {
    /** @type {EsbuildPlugin} */
    const plugin = {
      name: 'swap tape',
      setup(build) {
        build.onResolve({ filter: /^tape$/ }, () => {
          return { path: require.resolve('fresh-tape') }
        })
      },
    }

    return build(
      this,
      { plugins: [plugin] },
      `require('${require.resolve('./setup-tape.js').replace(/\\/g, '/')}')`,
      mode
    )
  }
}

module.exports = TapeRunner
