/* eslint-disable no-console */
'use strict'

const path = require('path')
const Runner = require('./runner')
const waitFor = require('p-wait-for')
const { build } = require('./utils')

const runZora = () => `
zora
  .report()
  .then((f) =>{
    self.PW_TEST.end(!self.zora.pass)
  })
`

const runZoraWorker = () => `
zora
  .report()
  .then((f) =>{
    postMessage({
        "pwRunEnded": true,
        "pwRunFailed": !self.zora.pass
    })
  })
`

class ZoraRunner extends Runner {
  /**
   * @param {import("playwright-core").Page} page
   * @param {string} file
   */
  async runTests(page, file) {
    await super.runTests(page, file)
    switch (this.options.mode) {
      case 'main': {
        await page.evaluate(runZora())
        break
      }
      case 'worker': {
        const worker = await page.waitForEvent('worker')
        // @ts-ignore
        await waitFor(() => worker.evaluate(() => self.zora !== undefined))
        await worker.evaluate(runZoraWorker())
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
    /**
     * @type {import('esbuild').Plugin} build
     */
    const plugin = {
      name: 'swap zora',
      setup(build) {
        build.onResolve({ filter: /^zora$/ }, (args) => {
          const setupPath = path.normalize('playwright-test/src/setup-zora.js')

          if (args.importer.endsWith(setupPath)) {
            return
          }

          return { path: path.join(__dirname, 'setup-zora.js') }
        })
      },
    }

    return build(
      this,
      {
        plugins: [plugin],
      },
      '',
      mode
    )
  }
}

module.exports = ZoraRunner
