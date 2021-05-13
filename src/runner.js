/* eslint-disable no-console */
'use strict'

const fs = require('fs')
const path = require('path')
const ora = require('ora')
const tempy = require('tempy')
const { premove } = require('premove/sync')
const merge = require('merge-options').bind({ ignoreUndefined: true })
const {
  redirectConsole,
  getPw,
  addWorker,
  findTests,
  defaultTestPatterns,
  createCov,
  createPolka,
} = require('./utils')
const { compileSw } = require('./utils/build-sw')

/**
 * @typedef {import('playwright-core').Page} Page
 * @typedef {import('playwright-core').BrowserContext} Context
 * @typedef {import('playwright-core').Browser} Browser
 * @typedef {import('./types').RunnerOptions} RunnerOptions
 * @typedef {import('playwright-core').ChromiumBrowserContext} ChromiumBrowserContext
 */

/**
 * @type {RunnerOptions}
 */
const defaultOptions = {
  cwd: process.cwd(),
  assets: '',
  browser: 'chromium',
  debug: false,
  mode: 'main', // worker
  incognito: false,
  input: undefined,
  extension: false,
  runnerOptions: {},
  before: undefined,
  sw: undefined,
  cov: false,
  extensions: 'js,cjs,mjs,ts,tsx',
  buildConfig: {},
  buildSWConfig: {},
}

class Runner {
  /**
   *
   * @param {Partial<import('./types').RunnerOptions>} [options]
   */
  constructor(options = {}) {
    /** @type {RunnerOptions} */
    this.options = merge(defaultOptions, options)
    /** @type {import('polka').Polka["server"] | null} */
    this.server = null
    this.dir = tempy.directory()
    this.browserDir = tempy.directory()
    this.url = ''
    this.stopped = false
    this.watching = false
    this.env = merge(JSON.parse(JSON.stringify(process.env)), {
      PW_TEST: this.options,
    })
    this.extensions = this.options.extensions.split(',')
    this.tests = findTests({
      cwd: this.options.cwd,
      extensions: this.extensions,
      filePatterns: this.options.input
        ? this.options.input
        : defaultTestPatterns(this.extensions),
    })
    if (this.tests.length === 0) {
      this.stop(false, 'No test files were found.')
    }
  }

  async launch() {
    // copy files to be served
    const files = [
      'index.html',
      'before.html',
      'favicon.ico',
      'manifest.json',
      'background.js',
      'setup.js',
    ]

    for (const file of files) {
      fs.copyFileSync(
        path.join(__dirname, './../static', file),
        path.join(this.dir, file)
      )
    }

    // setup http server
    await createPolka(this)

    // download playwright if needed
    const pw = await getPw(this.options.browser)
    /** @type {import('playwright-core').LaunchOptions} */
    const pwOptions = {
      headless: !this.options.extension && !this.options.debug,
      devtools: this.options.browser === 'chromium' && this.options.debug,
      args: this.options.extension
        ? [
            `--disable-extensions-except=${this.dir}`,
            `--load-extension=${this.dir}`,
          ]
        : [],
    }

    // create context
    if (this.options.incognito) {
      this.browser = await pw.launch(pwOptions)
      this.context = await this.browser.newContext()
    } else {
      this.context = await pw.launchPersistentContext(
        this.browserDir,
        pwOptions
      )
    }

    return this.context
  }

  /**
   * Setup Page
   *
   * @param {Context} context
   */
  async setupPage(context) {
    if (this.options.extension && this.options.browser !== 'chromium') {
      throw Error('Extension testing is only supported in chromium')
    }

    if (this.options.cov && this.options.browser !== 'chromium') {
      throw Error('Coverage is only supported in chromium')
    }

    if (this.options.cov && this.options.mode !== 'main') {
      throw Error(
        'Coverage is only supported in the main thread use mode:"main" '
      )
    }

    if (this.options.extension) {
      const context = /** @type {ChromiumBrowserContext} */ (this.context)
      const backgroundPages = await context.backgroundPages()
      this.page = backgroundPages.length
        ? backgroundPages[0]
        : await context.waitForEvent('backgroundpage')

      if (!this.page) {
        throw Error('Could not find the background page for the extension.')
      }

      if (this.options.debug) {
        // Open extension devtools window
        const extPage = await context.newPage()

        await extPage.goto(
          `chrome://extensions/?id=${
            // @ts-ignore
            this.page._mainFrame._initializer.url.split('/')[2]
          }`
        )

        const buttonHandle = await extPage.evaluateHandle(
          'document.querySelector("body > extensions-manager").shadowRoot.querySelector("extensions-toolbar").shadowRoot.querySelector("#devMode")'
        )

        // @ts-ignore
        await buttonHandle.click()

        const backgroundPageLink = await extPage.evaluateHandle(
          'document.querySelector("body > extensions-manager").shadowRoot.querySelector("#viewManager > extensions-detail-view").shadowRoot.querySelector("#inspect-views > li:nth-child(2) > a")'
        )

        // @ts-ignore
        await backgroundPageLink.click()
      }
    } else if (this.options.incognito) {
      this.page = await context.newPage()
      await this.page.goto(this.url)
    } else {
      this.page = context.pages()[0]
      await this.page.goto(this.url)
    }

    if (this.options.cov && this.page.coverage) {
      await this.page.coverage.startJSCoverage()
    }

    this.page.on('console', redirectConsole)
    return this.page
  }

  /**
   * Run the tests
   *
   * @param {Page} page
   * @param {string} file - file to load in the page
   */
  async runTests(page, file) {
    await page.addScriptTag({ url: 'setup.js' })
    await page.evaluate(`localStorage.debug = "${this.env.DEBUG}"`)
    if (this.options.sw) {
      await compileSw(this, {
        entry: this.options.sw,
        out: 'sw-out.js',
      })
      await page.evaluate(() => navigator.serviceWorker.register('/sw-out.js'))
    }

    switch (this.options.mode) {
      case 'main': {
        await page.addScriptTag({ url: file })
        break
      }
      case 'worker': {
        // do not await for the promise because we will wait for the 'worker' event after
        page.evaluate(addWorker(file))
        break
      }
      default:
        throw Error('mode not supported')
    }
  }

  async run() {
    let spinner = ora(`Setting up ${this.options.browser}`).start()

    try {
      // get the context
      const context = await this.launch()

      // run the before script
      if (this.options.before) {
        await this.runBefore(context)
      }

      // get the page
      const page = await this.setupPage(context)

      // uncaught rejections
      page.on('pageerror', (err) => {
        console.error(err)
        this.stop(
          true,
          'Uncaught exception happened within the page. Run with --debug.'
        )
      })
      spinner.succeed(`${this.options.browser} set up`)

      // bundle tests
      spinner = ora('Bundling tests').start()
      const file = await this.compiler()
      spinner.succeed()

      // run tests
      await this.runTests(page, file)

      // Re run on page reload
      if (this.options.debug) {
        page.on('load', async () => {
          await this.runTests(page, file)
        })
      } else {
        // wait for the tests
        await page.waitForFunction(
          // @ts-ignore
          () => self.PW_TEST.ended === true,
          undefined,
          {
            timeout: 0,
            polling: 100, // need to be polling raf doesnt work in extensions
          }
        )
        const testsFailed = await page.evaluate('self.PW_TEST.failed')

        // coverage
        if (this.options.cov && page.coverage) {
          await createCov(this, await page.coverage.stopJSCoverage(), file)
        }

        // exit
        await this.stop(testsFailed)
      }
    } catch (err) {
      spinner.fail('Running tests failed.')
      await this.stop(true, err)
    }
  }

  /**
   * Setup and run before page
   *
   * @param {Context} context
   */
  async runBefore(context) {
    const page = await context.newPage()
    await page.goto(this.url + 'before.html')

    page.on('pageerror', (err) => {
      this.stop(true, `Before page:\n ${err}`)
    })

    page.on('console', redirectConsole)

    const file = await this.compiler('before')
    await page.addScriptTag({ url: file })
    await page.waitForFunction('self.PW_TEST.beforeEnded', {
      timeout: 0,
    })
  }

  async watch() {
    const spinner = ora(`Setting up ${this.options.browser}`).start()

    const context = await this.launch()
    if (this.options.before) {
      spinner.text = 'Running before script'
      await this.runBefore(context)
    }
    const page = await this.setupPage(context)
    page.on('pageerror', console.error)

    spinner.succeed()

    this.compiler('watch')
  }

  /**
   * @param {boolean} fail
   * @param {string | undefined} [msg]
   */
  async stop(fail, msg) {
    if (this.stopped || this.options.debug) {
      return
    }
    this.stopped = true

    if (this.context) {
      await this.context.close()
    }

    const serverClose = new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            return reject(err)
          }
          resolve(true)
        })
      } else {
        resolve(true)
      }
    })

    await serverClose

    premove(this.dir)
    // premove(this.browserDir)

    if (fail && msg) {
      console.error(msg)
    } else if (msg) {
      console.log(msg)
    }
    process.exit(fail ? 1 : 0)
  }

  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<string>} file to be loaded in the page
   */
  async compiler(mode = 'bundle') {
    //
    throw new Error('abstract method')
  }
}

module.exports = Runner
