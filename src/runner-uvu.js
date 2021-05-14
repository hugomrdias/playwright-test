/* eslint-disable no-console */

import strip from 'strip-ansi'
import { Runner } from './runner.js'
import { build } from './utils/index.js'

const run = (/** @type {boolean} */ pass) => `
self.PW_TEST.end(${pass})
`

class UvuRunner extends Runner {
  /**
   * @param {import("playwright-core").Page} page
   * @param {string} file
   */
  async runTests(page, file) {
    let total = 0
    let passed = 0

    page.on('console', async (msg) => {
      const txt = msg.text()

      if (txt.includes('  Total: ')) {
        total = Number(txt.replace('Total:', '').trim())
      }
      if (txt.includes('  Passed: ')) {
        passed = Number(strip(txt.replace('Passed:', '').trim()))
        await page.evaluate(run(total !== passed))
      }
    })

    await super.runTests(page, file)
  }

  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<string>} file to be loaded in the page
   */
  compiler(mode = 'bundle') {
    return build(this, {}, '', mode)
  }
}

export default UvuRunner
