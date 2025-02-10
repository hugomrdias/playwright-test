/* eslint-disable no-console */

import { mkdirSync } from 'fs'
import { fileURLToPath } from 'node:url'
import path from 'path'
import { watch } from 'chokidar'
import cpy from 'cpy'
import { asyncExitHook, gracefulExit } from 'exit-hook'
import kleur from 'kleur'
import mergeOptions from 'merge-options'
import { nanoid } from 'nanoid'
import { premove } from 'premove/sync'
import { temporaryDirectory } from 'tempy'
import { compileSw } from './utils/build-sw.js'
import {
  addWorker,
  build,
  createCov,
  createPolka,
  defaultOptions,
  findTests,
  getPw,
  log,
  redirectConsole,
} from './utils/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const merge = mergeOptions.bind({ ignoreUndefined: true, concatArrays: true })

/**
 * @typedef {import('playwright-core').Page} Page
 * @typedef {import('playwright-core').BrowserContext} Context
 * @typedef {import('playwright-core').Browser} Browser
 * @typedef {import('playwright-core').ChromiumBrowserContext} ChromiumBrowserContext
 * @typedef {import('./types').RunnerOptions} RunnerOptions
 * @typedef {import('./types').TestRunner} TestRunner
 * @typedef {import('./types').RunnerEnv} RunnerEnv
 * @typedef {import('./types').CliOptions} CliOptions
 * @typedef {import('./types').ConfigFn} ConfigFn
 */

export class Runner {
  /**
   *
   * @param {Partial<import('./types').RunnerOptions>} options
   * @param {string[]} [testFiles]
   */
  constructor(options = {}, testFiles) {
    /** @type {import('./types').RunnerOptions} */
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

    /** @type {import('./types').RunnerEnv} */
    this.env = merge(JSON.parse(JSON.stringify(process.env)), {
      PW_OPTIONS: JSON.stringify(this.options),
      NODE_ENV: 'test',
    })
    this.tests =
      testFiles ??
      findTests({
        cwd: this.options.cwd,
        extensions: this.options.extensions.split(','),
        filePatterns: options.input ?? [],
      })

    if (this.tests.length === 0) {
      this.stop(false, 'No test files were found.')
    }

    process.env.DEBUG += ',-pw:*'
  }

  async setupContext() {
    // copy files to be served
    await cpy(path.join(__dirname, './../static') + '/**', this.dir)

    // setup http server
    const { server, url } = await createPolka(
      this.dir,
      this.options.cwd,
      this.options.assets
    )
    this.env.PW_SERVER = url
    this.url = url
    this.server = server

    // download playwright if needed
    const pw = await getPw(this.options.browser, this.options.debug)

    /** @type {import('playwright-core').LaunchOptions} */
    const pwOptions = {
      headless: !this.options.debug,
      devtools: this.options.browser === 'chromium' && this.options.debug,
      args: this.options.extension
        ? [
            `--disable-extensions-except=${this.dir}`,
            `--load-extension=${this.dir}`,
            ...(this.options.browser === 'chromium' && this.options.debug
              ? ['--auto-open-devtools-for-tabs']
              : []),
          ]
        : [
            ...(this.options.browser === 'chromium' && this.options.debug
              ? ['--auto-open-devtools-for-tabs']
              : []),
          ],
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
    // bindings
    await this.context.exposeFunction(
      'pwContextSetOffline',
      async (/** @type {boolean} */ offline) => {
        await this.context?.setOffline(offline)
      }
    )

    await this.context.exposeFunction(
      'pwContextGrantPermissions',
      async (
        /** @type {string[]} */ permissions,
        /** @type {{ origin?: string | undefined; } | undefined} */ options
      ) => {
        await this.context?.grantPermissions(permissions, options)
      }
    )

    await this.context.exposeFunction(
      'pwContextSetGeolocation',
      async (
        /** @type {{ latitude: number; longitude: number; accuracy?: number | undefined; } | null} */ geolocation
      ) => {
        await this.context?.setGeolocation(geolocation)
      }
    )

    await this.context.exposeFunction(
      'PW_TEST_STDOUT_WRITE',
      (/** @type {string | Uint8Array} */ msg) =>
        new Promise((resolve, reject) =>
          process.stdout.write(msg, (error) =>
            error ? reject(error) : resolve(error)
          )
        )
    )

    await this.context.exposeFunction(
      'PW_TEST_STDERR_WRITE',
      (/** @type {string | Uint8Array} */ msg) =>
        new Promise((resolve, reject) =>
          process.stderr.write(msg, (error) =>
            error ? reject(error) : resolve(error)
          )
        )
    )

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
      const backgroundPages = context.backgroundPages()
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

    // Setup page events
    this.page.on('console', redirectConsole)

    // uncaught rejections
    this.page.on('pageerror', (err) => {
      log.error(
        `Uncaught exception happened within the page. Run with --debug. \n${kleur.dim(
          err.stack?.toString() ?? err.toString()
        )}`
      )
    })

    await this.page.waitForLoadState('domcontentloaded')

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

    // Inject and register the service worker
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

    // Choose the mode
    switch (this.options.mode) {
      case 'main': {
        await page.addScriptTag({ url: outName, type: 'module' })
        break
      }
      case 'worker': {
        page.evaluate(addWorker(outName))
        break
      }
      default: {
        throw new Error('mode not supported')
      }
    }

    return { outName, files }
  }

  async run() {
    asyncExitHook(this.#clean.bind(this), {
      wait: 1000,
    })

    try {
      // Setup the context
      const context = await this.setupContext()
      this.beforeTestsOutput = await this.options.beforeTests(this.env)

      // Run the before script
      if (this.options.before) {
        await this.setupBeforePage(context)
      }

      // Setup page
      const page = await this.setupPage(context)
      log.info(`Browser "${this.options.browser}" setup complete.`)

      const { outName } = await this.runTests(page)

      // Re run on page reload
      if (this.options.debug) {
        page.on('load', () => {
          this.runTests(page).catch((error) => {
            console.log(error)
          })
        })
      }

      // run tests
      if (!this.options.debug) {
        // wait for the tests
        await page.waitForFunction(
          // @ts-ignore
          () => globalThis.PW_TEST.ended === true,
          undefined,
          {
            timeout: 0,
            polling: 100, // need to be polling raf doesnt work in extensions
          }
        )
        const testsFailed = await page.evaluate('globalThis.PW_TEST.failed')

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
        await this.stop(
          testsFailed,
          testsFailed ? 'Tests failed.' : 'Tests passed.'
        )
      }
    } catch (/** @type {any} */ error) {
      await this.stop(true, error)
    }
  }

  /**
   * Setup and run before page
   *
   * @param {Context} context
   */
  async setupBeforePage(context) {
    const page = await context.newPage()
    await page.goto(this.url + 'before.html')

    page.on('console', redirectConsole)
    page.on('pageerror', (err) => {
      log.error(
        `Uncaught exception happened within the before page. Run with --debug. \n${kleur.dim(
          err.stack?.toString() ?? err.toString()
        )}`
      )
    })

    const { outName } = await this.compiler('before')
    await page.addScriptTag({ url: outName })
    await page.waitForFunction('self.PW_TEST.beforeEnded', {
      timeout: 0,
    })
  }

  async watch() {
    asyncExitHook(this.#clean.bind(this), {
      wait: 1000,
    })

    // Setup the context
    const context = await this.setupContext()
    await this.options.beforeTests(this.env)

    // Run the before script
    if (this.options.before) {
      await this.setupBeforePage(context)
    }

    // Setup page
    const page = await this.setupPage(context)
    log.info(`Browser "${this.options.browser}" setup complete.`)

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
      try {
        console.error()
        log.info('Reloading tests...')
        const { files } = await this.runTests(page)
        watcher.add([...files])
      } catch (/** @type {any} */ error) {
        console.error(error.stack)
      }
    })
  }

  async #clean() {
    // Run after tests hook
    await this.options.afterTests(this.env)

    premove(this.dir)

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

    if (this.context) {
      await this.context.close()
    }
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

    if (fail && msg) {
      log.error(msg)
    } else if (msg) {
      log.success(msg)
    }

    gracefulExit(fail ? 1 : 0)
  }

  /**
   * Compile tests
   *
   * @param {"before" | "bundle" | "watch"} mode
   * @returns {Promise<import('./types').CompilerOutput>} file to be loaded in the page
   */
  async compiler(mode = 'bundle') {
    return build(
      this,
      this.options.testRunner.buildConfig
        ? this.options.testRunner.buildConfig(this.options)
        : {},
      this.options.testRunner.compileRuntime(
        this.options,
        this.tests.map((t) => t.replaceAll('\\', '/'))
      ),
      mode
    )
  }
}
