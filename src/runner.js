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
  AFTER_TESTS_TIMEOUT,
  addWorker,
  assertBrowserOptions,
  assertRunTimeout,
  build,
  createPolka,
  defaultOptions,
  findTests,
  getPw,
  log,
  readConsole,
  resolveTestRunner,
  runAfterTests,
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
// Saving many files at once changes them within the poll of the watcher
const WATCH_DEBOUNCE = 200

/**
 * @typedef {import('playwright-core').Page} Page
 * @typedef {import('playwright-core').BrowserContext} Context
 * @typedef {import('playwright-core').Browser} Browser
 * @typedef {import('playwright-core').ChromiumBrowserContext} ChromiumBrowserContext
 * @typedef {import('./types').RunnerOptions} RunnerOptions
 * @typedef {import('./types').RunnerEnv} RunnerEnv
 * @typedef {import('./types').CliOptions} CliOptions
 * @typedef {import('./types').ConfigFn} ConfigFn
 */

export class Runner {
  /**
   *
   * @param {import('./types').Config} options
   * @param {string[]} [testFiles]
   */
  constructor(options, testFiles) {
    /** @type {import('./types').RunnerOptions} */
    this.options = merge(defaultOptions, options)
    this.options.testRunner = resolveTestRunner(options)
    assertRunTimeout(this.options.runTimeout)
    assertBrowserOptions(this.options)
    this.options.cwd = path.resolve(this.options.cwd)
    /** @type {import('polka').Polka["server"] | undefined} */
    this.server = undefined

    this.dir = path.join(__dirname, '../.tmp', nanoid())
    this.stackMapper = createStackMapper(this.dir)
    this.url = ''
    this.stopped = false
    this.pageErrored = false
    /** @type {unknown} */
    this.beforeTestsOutput = undefined
    /** @type {Promise<boolean> | undefined} */
    this.afterTestsResult = undefined
    /** @type {Set<Promise<void>>} */
    this.pendingConsole = new Set()
    /** @type {Promise<void>} */
    this.lastConsole = Promise.resolve()

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
      return
    }

    mkdirSync(this.dir, {
      recursive: true,
    })
    process.env.DEBUG = [process.env.DEBUG, '-pw:*'].filter(Boolean).join(',')
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

    // Only Chromium reports service workers, the others keep their output
    this.context.on('serviceworker', (worker) => {
      worker.on('console', this.#onConsole)
    })

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
    // `/` clears the storage of the site, which would wipe what the before
    // script set up. It only runs once, so also not when reloading.
    const url = this.options.before ? `${this.url}index.html` : this.url

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
      await this.page.goto(url)
    } else {
      this.page = context.pages()[0]
      await this.page.goto(url)
    }

    // Setup page events
    this.page.on('console', this.#onConsole)

    // uncaught rejections
    this.page.on('pageerror', (err) => {
      this.pageErrored = true
      log.error(
        `Uncaught exception happened within the page. Run with --debug. \n${kleur.dim(
          // The stack of a syntax error can be empty
          this.stackMapper.map(err.stack || err.toString())
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
    await page.evaluate((debug) => {
      localStorage.debug = debug
    }, [this.env.DEBUG, '-pw:*', '-mocha:*'].filter(Boolean).join(','))
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
      // `ready` never resolves when the registration fails
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw-out.js')
        await navigator.serviceWorker.ready
      })
    }

    // Choose the mode
    const loader = `load.js?entry=${outName}`
    if (this.options.mode === 'worker') {
      await page.evaluate(addWorker(loader))
    } else {
      await page.addScriptTag({ url: loader, type: 'module' })
    }

    return { outName, files }
  }

  async run() {
    if (this.stopped) {
      return
    }
    asyncExitHook(this.#clean.bind(this), {
      wait: AFTER_TESTS_TIMEOUT + EXIT_WAIT,
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

      await this.runTests(page)

      // Re run on page reload
      if (this.options.debug) {
        page.on('load', () => {
          this.runTests(page).catch((error) => {
            console.error(error)
          })
        })
      }

      // run tests
      if (!this.options.debug) {
        // wait for the tests
        await page.waitForFunction(
          // Nothing ends a run once a navigation took the controller away
          // @ts-expect-error
          () => !globalThis.PW_TEST || globalThis.PW_TEST.ended === true,
          undefined,
          {
            timeout: 0,
            polling: 100, // need to be polling raf doesnt work in extensions
          }
        )
        // Page errors come in order with this result, so they're all in by now
        const testsFailed = await page.evaluate('globalThis.PW_TEST?.failed')
        if (testsFailed === undefined) {
          await this.stop(
            true,
            'The page navigated away from the tests, they have to stay on the page they were loaded in.'
          )
          return
        }

        const failed =
          testsFailed ||
          // `none` has no tests to fail, the files decide
          (this.pageErrored && this.options.runner !== 'none')

        // exit
        await this.stop(failed, failed ? 'Tests failed.' : undefined)
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

    page.on('console', this.#onConsole)
    page.on('pageerror', async (err) => {
      const message = `Uncaught exception happened within the before page. Run with --debug. \n${kleur.dim(
        this.stackMapper.map(err.stack || err.toString())
      )}`
      // Ask the page, the wait below only notices `beforeEnd` when it next polls.
      // Without a page the wait fails the run by itself.
      const ended = await page
        .evaluate('self.PW_TEST?.beforeEnded')
        .catch(() => true)

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
  }

  async watch() {
    if (this.stopped) {
      return
    }
    asyncExitHook(this.#clean.bind(this), {
      wait: AFTER_TESTS_TIMEOUT + EXIT_WAIT,
    })

    /** @type {Page} */
    let page
    /** @type {string[]} */
    let files
    try {
      // Setup the context
      const context = await this.setupContext()
      this.beforeTestsOutput = await this.options.beforeTests(this.env)

      // Run the before script
      if (this.options.before) {
        await this.setupBeforePage(context)
      }

      // Setup page
      page = await this.setupPage(context)

      ;({ files } = await this.runTests(page))
    } catch (/** @type {any} */ error) {
      await this.stop(true, error)
      return
    }

    let running = false
    let pending = false
    /** @type {NodeJS.Timeout | undefined} */
    let debounce

    // One run at a time, a reload in the middle of another one breaks both.
    // Changes that happen during a run get a single run after it.
    const rerun = async () => {
      if (running) {
        pending = true
        return
      }
      running = true
      do {
        pending = false
        try {
          // Unregister any service worker in the page before reload
          await page.evaluate(async () => {
            const regs = await navigator.serviceWorker.getRegistrations()
            await Promise.all(regs.map((reg) => reg.unregister()))
          })
          await page.reload()
          console.error()
          log.info('Reloading tests...')
          const { files } = await this.runTests(page)
          watcher.add([...files])
        } catch (/** @type {any} */ error) {
          // Closing the browser on the way out fails whatever was running
          if (!this.stopped) {
            console.error(error.stack)
          }
        }
      } while (pending && !this.stopped)
      running = false
    }

    const watcher = watch([...files], {
      // Match dot files relative to cwd, so projects inside dot folders still work.
      // Not `..`, that's a file of the project outside of cwd like in a monorepo.
      ignored: (file) =>
        /(^|[/\\])\.(?!\.([/\\]|$))/.test(
          path.relative(this.options.cwd, file)
        ),
      ignoreInitial: true,
      awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 },
    }).on('change', () => {
      clearTimeout(debounce)
      debounce = setTimeout(rerun, WATCH_DEBOUNCE)
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
    // Read it right away, print it after the messages that came before it
    const read = readConsole(msg, this.stackMapper.map)
    const pending = this.lastConsole
      .then(async () => {
        const print = await read
        print()
      })
      .finally(() => {
        this.pendingConsole.delete(pending)
      })
    this.lastConsole = pending
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
      await Promise.allSettled([
        ...(this.context?.pages() ?? []).flatMap((page) => [
          page.evaluate('0'),
          ...page.workers().map((worker) => worker.evaluate('0')),
        ]),
        ...(this.context?.serviceWorkers() ?? []).map((worker) =>
          worker.evaluate('0')
        ),
      ])

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

  /**
   * Run the after tests hook once, `stop` needs its result for the exit code and
   * when this process gets stopped only the exit hook gets to run it.
   */
  #afterTests() {
    this.afterTestsResult ??= runAfterTests(
      this.options.afterTests,
      this.env,
      this.beforeTestsOutput
    )
    return this.afterTestsResult
  }

  async #clean() {
    // Whatever is running fails from here on because of the browser closing
    this.stopped = true

    await this.#afterTests()

    premove(this.dir)

    const close = async () => {
      // Before the server, its open connections could use up the wait for the exit
      if (this.context) {
        await this.context.close()
      }

      await new Promise((resolve, reject) => {
        if (this.server) {
          this.server.close((err) => (err ? reject(err) : resolve(true)))
        } else {
          resolve(true)
        }
      })
    }

    /** @type {NodeJS.Timeout | undefined} */
    let timer
    await Promise.race([
      close().catch((/** @type {Error} */ error) => {
        log.warn(`Could not close the browser: ${error.message}`)
      }),
      new Promise((resolve) => {
        timer = setTimeout(resolve, EXIT_WAIT)
      }),
    ])
    clearTimeout(timer)
  }

  /**
   * @param {boolean} fail
   * @param {string | undefined} [msg]
   */
  async stop(fail, msg) {
    if (this.stopped) {
      return
    }
    // The browser stays open to debug the failure, without one there's nothing to
    if (this.options.debug && this.context) {
      if (fail && msg) {
        log.error(msg)
      }
      return
    }
    this.stopped = true

    if (this.context) {
      await this.#flushConsole()
    }

    if (fail && msg) {
      log.error(msg)
    }

    const afterTestsPassed = await this.#afterTests()
    gracefulExit(fail || !afterTestsPassed ? 1 : 0)
  }

  /**
   * Compile tests
   *
   * @param {"before" | "bundle"} mode
   * @returns {Promise<import('./types').CompilerOutput>} file to be loaded in the page
   */
  compiler(mode = 'bundle') {
    return build(
      this,
      this.options.testRunner.buildConfig?.(this.options),
      this.options.testRunner.compileRuntime(
        this.options,
        this.tests.map((t) => t.replaceAll('\\', '/'))
      ),
      mode
    )
  }
}
