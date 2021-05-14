/* eslint-disable no-console */

import merge from 'merge-options'
import { Runner } from './runner.js'
import waitFor from 'p-wait-for'
import { build } from './utils/index.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

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
        // @ts-ignore
        await waitFor(() => worker.evaluate(() => self.mocha !== undefined))
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

export default MochaRunner
