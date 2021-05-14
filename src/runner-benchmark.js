/* eslint-disable no-console */

import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Runner } from './runner.js'
import { build } from './utils/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class BenchmarkRunner extends Runner {
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
          return { path: join(__dirname, 'setup-bench.js') }
        })
      },
    }

    return build(this, { plugins: [plugin] })
  }
}
