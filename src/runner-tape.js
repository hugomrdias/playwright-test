/* eslint-disable no-console */
'use strict'
const path = require('path')
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
        build.onResolve({ filter: /^stream$/ }, () => {
          return { path: require.resolve('stream-browserify') }
        })
        build.onResolve({ filter: /^fs$/ }, () => {
          return { path: require.resolve('./empty-fs.js') }
        })
      },
    }

    return build(
      this,
      {
        plugins: [plugin],
        inject: [path.join(__dirname, 'node-globals-buffer.js')],
      },
      `require('${require.resolve('./setup-tape.js').replace(/\\/g, '/')}')`,
      mode
    )
  }
}

module.exports = TapeRunner
