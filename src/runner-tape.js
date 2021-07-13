/* eslint-disable no-console */

import path from 'path'
import { Runner } from './runner.js'
import { build } from './utils/index.js'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
/**
 * @typedef {import('esbuild').Plugin} EsbuildPlugin
 */

class TapeRunner extends Runner {
  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<import('./types.js').CompilerOutput>} file to be loaded in the page
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

export default TapeRunner
