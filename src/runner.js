/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { fileURLToPath } from 'node:url'
import { watch } from 'chokidar'
import { asyncExitHook, gracefulExit } from 'exit-hook'
import { mkdirSync } from 'fs'
import { cp } from 'fs/promises'
import kleur from 'kleur'
// @ts-expect-error
import mergeOptions from 'merge-options'
import { nanoid } from 'nanoid'
import path from 'path'
// @ts-expect-error
import { premove } from 'premove/sync'
import { compileSw } from './utils/build-sw.js'
import {
  addWorker,
  assertRunTimeout,
  build,
  createPolka,
  defaultOptions,
  findTests,
  getPw,
  log,
  redirectConsole,
  runTimeoutMessage,
} from './utils/index.js'
import { createStackMapper } from './utils/stack-map.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const merge = mergeOptions.bind({ ignoreUndefined: true, concatArrays: true })
// Tests of stuck pages lower it, they always wait for all of it
const CONSOLE_FLUSH_TIMEOUT =
  Number(process.env.PW_TEST_CONSOLE_FLUSH_TIMEOUT) || 5000
// Firefox on GitHub's Windows runners can take close to 3s to close, and the
// browser profile can't be deleted until it does
const EXIT_WAIT = 5000

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
  constructor(options, testFiles) {
    /** @type {import('./types').RunnerOptions} */
    this.options = merge(defaultOptions, options)
    assertRunTimeout(this.options.runTimeout)
    /** @type {import('polka').Polka["server"] | undefined} */
    this.server = undefined

    this.dir = path.join(__dirname, '../.tmp', nanoid())
    mkdirSync(this.dir, {
      recursive: true,
    })
    this.stackMapper = createStackMapper(this.dir)
    this.url = ''
    this.stopped = false
    this.watching = false
    /** @type {Set<Promise<void>>} */
    this.pendingConsole = new Set()

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
      // Not with `stop`, under --debug it would wait with nothing to debug
      this.stopped = true
      log.error('No test files were found.')
      gracefulExit(1)
    }

    process.env.DEBUG += ',-pw:*'
  }

  async setupContext() {
    // copy files to be served
    await cp(path.join(__dirname, './../static'), this.dir, { recursive: true })

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
    const pw = await getPw(
      this.options.browser,
      this.options.debug,
      this.options.extension
    )

    /** @type {import('playwright-core').LaunchOptions} */
    const pwOptions = {
      // optin to new chromium headless for extension testing
      // https://github.com/microsoft/playwright/issues/33566
      channel: this.options.extension ? this.options.browser : undefined,
      headless: !this.options.debug,
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
      // With an empty path Playwright creates the profile in the temp folder and
      // deletes it, also when the exit hook doesn't wait for the browser to close
      this.context = await pw.launchPersistentContext('', {
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
          process.stdout.write(this.stackMapper.map(msg), (error) =>
            error ? reject(error) : resolve(error)
          )
        )
    )

    await this.context.exposeFunction(
      'PW_TEST_STDERR_WRITE',
      (/** @type {string | Uint8Array} */ msg) =>
        new Promise((resolve, reject) =>
          process.stderr.write(this.stackMapper.map(msg), (error) =>
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

    if (this.options.extension) {
      const context = /** @type {ChromiumBrowserContext} */ (this.context)
      let [serviceWorker] = context.serviceWorkers()
      if (!serviceWorker)
        serviceWorker = await context.waitForEvent('serviceworker')

      const extensionId = serviceWorker.url().split('/')[2]
      this.page = context.pages()[0]
      await this.page.goto(`chrome-extension://${extensionId}/popup.html`)

      // if (!this.page) {
      //   throw new Error('Could not find the background page for the extension.')
      // }

      if (this.options.debug) {
        // Open extension devtools window
        const extPage = await context.newPage()

        await extPage.goto(`chrome://extensions/?id=${extensionId}`)

        const buttonHandle = await extPage.evaluateHandle(
          'document.querySelector("body > extensions-manager").shadowRoot.querySelector("extensions-toolbar").shadowRoot.querySelector("#devMode")'
        )

        await buttonHandle.click()

        const backgroundPageLink = await extPage.evaluateHandle(
          'document.querySelector("body > extensions-manager").shadowRoot.querySelector("#viewManager > extensions-detail-view").shadowRoot.querySelector("#inspect-views > li:nth-child(2) > a")'
        )

        await backgroundPageLink.click()
      }
    } else if (this.options.incognito) {
      this.page = await context.newPage()
      await this.page.goto(this.url)
    } else {
      this.page = context.pages()[0]
      await this.page.goto(this.url)
    }

    // Setup page events
    this.page.on('console', this.#onConsole)

    // uncaught rejections
    this.page.on('pageerror', (err) => {
      log.error(
        `Uncaught exception happened within the page. Run with --debug. \n${kleur.dim(
          this.stackMapper.map(err.stack?.toString() ?? err.toString())
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
    this.stackMapper.reset()
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
        navigator.serviceWorker.register('/sw-out.js')
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
      wait: EXIT_WAIT,
    })

    try {
      // Setup the context
      const context = await this.setupContext()
      // After setupContext, downloading a browser doesn't count
      this.#startRunTimeout()
      this.beforeTestsOutput = await this.options.beforeTests(this.env)

      // Run the before script
      if (this.options.before) {
        await this.setupBeforePage(context)
      }

      // Setup page
      const page = await this.setupPage(context)
      log.info(`Browser "${this.options.browser}" setup complete.`)

      await this.runTests(page)

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
          // @ts-expect-error
          () => globalThis.PW_TEST.ended === true,
          undefined,
          {
            timeout: 0,
            polling: 100, // need to be polling raf doesnt work in extensions
          }
        )
        const testsFailed = await page.evaluate('globalThis.PW_TEST.failed')

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
    await page.goto(`${this.url}before.html`)

    let ended = false

    page.on('console', this.#onConsole)
    page.on('pageerror', (err) => {
      const message = `Uncaught exception happened within the before page. Run with --debug. \n${kleur.dim(
        this.stackMapper.map(err.stack?.toString() || err.toString())
      )}`

      // A script that threw may never call `beforeEnd`, don't wait for it. The
      // page stays open under --debug and `stop` does nothing there.
      if (ended || this.options.debug) {
        log.error(message)
      } else {
        this.stop(true, message)
      }
    })

    const { outName } = await this.compiler('before')
    await page.addScriptTag({ url: outName, type: 'module' })
    // PW_TEST is set by the bundle, which can still be loading its imports
    await page.waitForFunction('self.PW_TEST?.beforeEnded', undefined, {
      timeout: 0,
      polling: 100, // raf doesn't run in a tab that's in the background
    })
    ended = true
  }

  async watch() {
    asyncExitHook(this.#clean.bind(this), {
      wait: EXIT_WAIT,
    })

    // Setup the context
    const context = await this.setupContext()
    await this.options.beforeTests(this.env)

    // Run the before script
    if (this.options.before) {
      try {
        await this.setupBeforePage(context)
      } catch (/** @type {any} */ error) {
        await this.stop(true, error)
        return
      }
    }

    // Setup page
    const page = await this.setupPage(context)
    log.info(`Browser "${this.options.browser}" setup complete.`)

    const { files } = await this.runTests(page)

    const watcher = watch([...files], {
      // Match dot files relative to cwd, so projects inside dot folders still work
      ignored: (file) =>
        /(^|[/\\])\../.test(path.relative(this.options.cwd, file)),
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

  /**
   * Fail the run when it takes too long. Nothing in the page can be trusted to
   * end it, a test stuck in a loop blocks the thread it would report from.
   */
  #startRunTimeout() {
    const ms = this.options.runTimeout
    if (ms > 0 && !this.options.debug) {
      setTimeout(() => this.stop(true, runTimeoutMessage(ms)), ms).unref()
    }
  }

  /**
   * Print a console message and keep track of it until it's done
   *
   * @param {import('playwright-core').ConsoleMessage} msg
   */
  #onConsole = (msg) => {
    const pending = redirectConsole(msg, this.stackMapper.map).finally(() => {
      this.pendingConsole.delete(pending)
    })
    this.pendingConsole.add(pending)
  }

  /**
   * Wait for the browser console messages to be printed, closing the browser
   * rejects the ones still reading their arguments and drops the ones still on
   * their way. A stuck page only delays the exit up to the timeout.
   */
  async #flushConsole() {
    const flush = async () => {
      // Console messages come in order with evaluate results from the same
      // target, after this round trip the older ones already reached node.
      // Workers need their own, the message ending the run can overtake them.
      await Promise.allSettled(
        (this.context?.pages() ?? []).flatMap((page) => [
          page.evaluate('0'),
          ...page.workers().map((worker) => worker.evaluate('0')),
        ])
      )

      while (this.pendingConsole.size > 0) {
        await Promise.allSettled(this.pendingConsole)
      }
      return true
    }

    /** @type {NodeJS.Timeout | undefined} */
    let timer
    const flushed = await Promise.race([
      flush(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, CONSOLE_FLUSH_TIMEOUT, false)
      }),
    ])
    clearTimeout(timer)

    if (!flushed) {
      log.warn(
        'Timed out waiting for browser console output, some may be lost.'
      )
    }
  }

  async #clean() {
    // Run after tests hook
    await this.options.afterTests(this.env)

    premove(this.dir)

    // Before the server, its open connections could use up the wait for the exit
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
      await this.#flushConsole()
    }

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
  compiler(mode = 'bundle') {
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
