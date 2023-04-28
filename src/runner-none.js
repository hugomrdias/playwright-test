/* eslint-disable no-console */

import { Runner } from './runner.js'
import { build } from './utils/index.js'

export class NoneRunner extends Runner {
  constructor(options = {}) {
    super(options)
    this.type = 'none'
  }

  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<import('./types.js').CompilerOutput>} file to be loaded in the page
   */
  compiler(mode) {
    return build(this)
  }
}
