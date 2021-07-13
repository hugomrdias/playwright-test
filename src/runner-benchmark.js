/* eslint-disable no-console */

import path from 'path'
import { fileURLToPath } from 'url'
import { Runner } from './runner.js'
import { build } from './utils/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class BenchmarkRunner extends Runner {
  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<import('./types.js').CompilerOutput>} file to be loaded in the page
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
