/* eslint-disable no-console */

import path from 'path'
import { Runner } from './runner.js'
import waitFor from 'p-wait-for'
import { build } from './utils/index.js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const runZora = () => `
zora
  .report({reporter: globalThis.zoraReporter})
`

const testsEnded = (/** @type {boolean} */ pass) => `
self.PW_TEST.end(${pass})
`

class ZoraRunner extends Runner {
  /**
   * @param {import("playwright-core").Page} page
   */
  async runTests(page) {
    let fail = 0

    // check summary to trigger tests ended
    page.on('console', async (msg) => {
      const txt = msg.text()

      if (txt.includes('# fail  ')) {
        fail = Number(txt.replace('# fail', '').trim())
        await page.evaluate(testsEnded(fail > 0))
      }
    })

    const { outName, files } = await super.runTests(page)
    switch (this.options.mode) {
      case 'main': {
        await page.evaluate(runZora())
        break
      }
      case 'worker': {
        const worker = await page.waitForEvent('worker')
        // @ts-ignore
        await waitFor(() => worker.evaluate(() => self.zora !== undefined))
        await worker.evaluate(runZora())
        break
      }
      default: {
        throw new Error('mode not supported')
      }
    }
    return { outName, files }
  }

  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<import('./types.js').CompilerOutput>} file to be loaded in the page
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

export default ZoraRunner
