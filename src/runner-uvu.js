/* eslint-disable no-console */
'use strict'

const path = require('path')
const strip = require('strip-ansi')
const Runner = require('./runner')
const { build } = require('./utils')

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
    return build(
      this,
      { inject: [path.join(__dirname, 'node-globals.js')] },
      '',
      mode
    )
  }
}

module.exports = UvuRunner
