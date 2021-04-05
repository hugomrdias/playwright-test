/* eslint-disable no-console */
'use strict'

const path = require('path')
const Runner = require('./runner')
const { build } = require('./utils')

class BenchmarkRunner extends Runner {
  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<string>} file to be loaded in the page
   */
  compiler(mode) {
    /** @type {import('esbuild').Plugin} */
    const plugin = {
      name: 'swap benchmark',
      setup(build) {
        build.onResolve({ filter: /^benchmark$/ }, () => {
          return { path: path.join(__dirname, 'setup-bench.js') }
        })
      },
    }

    return build(this, { plugins: [plugin] })
  }
}

module.exports = BenchmarkRunner
