/* eslint-disable no-console */

import { mkdirSync } from 'fs'
import path from 'path'
import ora from 'ora'
import { nanoid } from 'nanoid'
import { temporaryDirectory } from 'tempy'
import { premove } from 'premove/sync'
import {
  redirectConsole,
  getPw,
  addWorker,
  findTests,
  defaultTestPatterns,
  createCov,
  createPolka,
} from './utils/index.js'
import { compileSw } from './utils/build-sw.js'
import mergeOptions from 'merge-options'
import { fileURLToPath } from 'node:url'
import { watch } from 'chokidar'
import cpy from 'cpy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const merge = mergeOptions.bind({ ignoreUndefined: true })

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
  reportDir: '.nyc_output',
  extensions: 'js,cjs,mjs,ts,tsx',
  buildConfig: {},
  buildSWConfig: {},
  browserContextOptions: {},
  beforeTests: async () => {},
  afterTests: async () => {},
}

export class Runner {
  /**
   *
   * @param {Partial<import('./types').RunnerOptions>} [options]
   */
  constructor(options = {}) {
    /** @type {RunnerOptions} */
    this.options = merge(defaultOptions, options)
    /** @type {import('polka').Polka["server"] | undefined} */
    this.server = undefined

    this.dir = path.join(__dirname, '../.tmp', nanoid())
    mkdirSync(this.dir, {
      recursive: true,
    })
    this.browserDir = temporaryDirectory()
    this.url = ''
    this.stopped = false
    this.watching = false
    this.env = merge(JSON.parse(JSON.stringify(process.env)), {
      PW_TEST: this.options,
    })
    this.extensions = this.options.extensions.split(',')
    this.beforeTestsOutput = undefined
    this.tests = findTests({
      cwd: this.options.cwd,
      extensions: this.extensions,
      filePatterns: this.options.input ?? defaultTestPatterns(this.extensions),
    })
    if (this.tests.length === 0) {
      this.stop(false, 'No test files were found.')
    }

    process.env.DEBUG += ',-pw:*'
  }

  async launch() {
    // copy files to be served
    await cpy(path.join(__dirname, './../static') + '/**', this.dir)

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
      this.context = await this.browser.newContext(
        this.options.browserContextOptions
      )
    } else {
      this.context = await pw.launchPersistentContext(this.browserDir, {
        ...pwOptions,
        ...this.options.browserContextOptions,
      })
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
      throw new Error('Extension testing is only supported in chromium')
    }

    if (this.options.cov && this.options.browser !== 'chromium') {
      throw new Error('Coverage is only supported in chromium')
    }

    if (this.options.cov && this.options.mode !== 'main') {
      throw new Error(
        'Coverage is only supported in the main thread use mode:"main" '
      )
    }

    if (this.options.extension) {
      const context = /** @type {ChromiumBrowserContext} */ (this.context)
      const backgroundPages = await context.backgroundPages()
      this.page =
        backgroundPages.length > 0
          ? backgroundPages[0]
          : await context.waitForEvent('backgroundpage')

      if (!this.page) {
        throw new Error('Could not find the background page for the extension.')
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
    // uncaught rejections
    this.page.on('pageerror', (err) => {
      console.error(err)
      this.stop(
        true,
        'Uncaught exception happened within the page. Run with --debug.'
      )
    })
    return this.page
  }

  /**
   * Run the tests
   *
   * @param {Page} page
   */
  async runTests(page) {
    await page.addScriptTag({ url: 'setup.js' })
    await page.evaluate(
      `localStorage.debug = "${this.env.DEBUG},-pw:*,-mocha:*"`
    )
    const files = []
    const { outName, files: mainFiles } = await this.compiler()
    files.push(...mainFiles)

    switch (this.options.mode) {
      case 'main': {
        await page.addScriptTag({ url: outName })
        break
      }
      case 'worker': {
        // do not await for the promise because we will wait for the 'worker' event after
        page.evaluate(addWorker(outName))
        break
      }
      default: {
        throw new Error('mode not supported')
      }
    }

    // inject and register the service
    if (this.options.sw) {
      const { files: swFiles } = await compileSw(this, {
        entry: this.options.sw,
      })
      files.push(...swFiles)
      await page.evaluate(() => {
        navigator.serviceWorker.register(`/sw-out.js`)
        return navigator.serviceWorker.ready
      })
    }

    return { outName, files }
  }

  async run() {
    this.beforeTestsOutput = await this.options.beforeTests(this.options)

    const spinner = ora(`Setting up ${this.options.browser}`).start()

    try {
      // get the context
      const context = await this.launch()

      // run the before script
      if (this.options.before) {
        await this.runBefore(context)
      }

      // get the page
      const page = await this.setupPage(context)
      spinner.succeed(`${this.options.browser} set up`)

      if (this.options.debug) {
        page.on('load', async () => {
          this.runTests(page).catch((error) => {
            console.log(error)
          })
        })
      }
      // run tests
      const { outName } = await this.runTests(page)

      // Re run on page reload
      if (!this.options.debug) {
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
          await createCov(
            this,
            await page.coverage.stopJSCoverage(),
            outName,
            this.options.reportDir
          )
        }

        // exit
        await this.stop(testsFailed)
      }
    } catch (/** @type {any} */ error) {
      spinner.fail('Running tests failed.')
      await this.stop(true, error)
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

    page.on('console', redirectConsole)
    page.on('pageerror', (err) => {
      this.stop(true, `Before page:\n ${err}`)
    })

    const { outName } = await this.compiler('before')
    await page.addScriptTag({ url: outName })
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

    spinner.succeed()
    const { files } = await this.runTests(page)

    const watcher = watch([...files], {
      ignored: /(^|[/\\])\../,
      ignoreInitial: true,
      awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 },
    }).on('change', async () => {
      // Unregister any service worker in the page before reload
      await page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations()
        return regs[0] ? regs[0].unregister() : Promise.resolve()
      })
      await page.reload()
      const { files } = await this.runTests(page)
      watcher.add([...files])
    })
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

    // Run after tests hook
    await this.options.afterTests(this.options, this.beforeTestsOutput)

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

    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(fail ? 1 : 0)
  }

  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<import('./types').CompilerOutput>} file to be loaded in the page
   */
  async compiler(mode = 'bundle') {
    //
    throw new Error('abstract method')
  }
}
