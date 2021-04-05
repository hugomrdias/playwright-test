/* eslint-disable no-console */
'use strict'

const merge = require('merge-options')
const Runner = require('./runner')
const { build } = require('./utils')

const runMocha = () => `
mocha
  .run((f) =>{
    self.PW_TEST.end(f > 0)
  })
`

const runMochaWorker = () => `
mocha
  .run((f)=>{
    postMessage({
        "pwRunEnded": true,
        "pwRunFailed": f > 0
    })
  })
`

class MochaRunner extends Runner {
  constructor(options = {}) {
    super(
      merge(
        {
          runnerOptions: {
            allowUncaught: false,
            bail: true,
            reporter: 'spec',
            timeout: 5000,
            color: true,
            ui: 'bdd',
          },
        },
        options
      )
    )
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} file
   */
  async runTests(page, file) {
    await super.runTests(page, file)
    switch (this.options.mode) {
      case 'main': {
        await page.evaluate(runMocha())
        break
      }
      case 'worker': {
        const worker = await page.waitForEvent('worker')
        await worker.evaluate(runMochaWorker())
        break
      }
      default:
        throw Error('mode not supported')
    }
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
      {},
      `require('${require.resolve('./setup-mocha.js').replace(/\\/g, '/')}')`,
      mode
    )
  }
}

module.exports = MochaRunner
