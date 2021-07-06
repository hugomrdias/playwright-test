/* eslint-disable no-console */

import path from 'path'
import merge from 'merge-options'
import { Runner } from './runner.js'
import waitFor from 'p-wait-for'
import { build } from './utils/index.js'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
/**
 * @typedef {import('esbuild').Plugin} EsbuildPlugin
 */
const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
        throw new Error('mode not supported')
    }
  }

  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<string>} file to be loaded in the page
   */
  compiler(mode = 'bundle') {
    /** @type {EsbuildPlugin} */
    const plugin = {
      name: 'swap tape',

      setup(build) {
        build.onResolve({ filter: /^stream$/ }, () => {
          return { path: require.resolve('stream-browserify') }
        })
      },
    }
    return build(
      this,
      {
        plugins: [plugin],
        inject: [path.join(__dirname, 'node-globals-buffer.js')],
      },
      `require('${require.resolve('./setup-mocha.js').replace(/\\/g, '/')}')`,
      mode
    )
  }
}

export default MochaRunner
