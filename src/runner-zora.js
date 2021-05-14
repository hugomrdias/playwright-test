/* eslint-disable no-console */

import { normalize, join, dirname } from 'path'
import { Runner } from './runner.js'
import waitFor from 'p-wait-for'
import { build } from './utils/index.js'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
          const setupPath = normalize('playwright-test/src/setup-zora.js')

          if (args.importer.endsWith(setupPath)) {
            return
          }

          return { path: join(__dirname, 'setup-zora.js') }
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

export default ZoraRunner
