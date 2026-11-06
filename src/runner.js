/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { fileURLToPath } from 'node:url'
import { watch } from 'chokidar'
import { asyncExitHook } from 'exit-hook'
import { cp } from 'fs/promises'
import kleur from 'kleur'
import path from 'path'
import { BaseRunner } from './base-runner.js'
import { compileSw } from './utils/build-sw.js'
import {
  AFTER_TESTS_TIMEOUT,
  addWorker,
  assertBrowserOptions,
  build,
  createPolka,
  getPw,
  log,
  readConsole,
  runTimeoutMessage,
} from './utils/index.js'
import { createStackMapper } from './utils/stack-map.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Tests of stuck pages lower it, they always wait for all of it
const CONSOLE_FLUSH_TIMEOUT =
  Number(process.env.PW_TEST_CONSOLE_FLUSH_TIMEOUT) || 5000
// Firefox on GitHub's Windows runners can take close to 3s to close, and the
// browser profile can't be deleted until it does
const EXIT_WAIT = 5000
// Saving many files at once changes them within the poll of the watcher
const WATCH_DEBOUNCE = 200
// Tests of workers that never claim the page lower it
const SW_CLAIM_TIMEOUT = Number(process.env.PW_TEST_SW_CLAIM_TIMEOUT) || 5000

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

export class Runner extends BaseRunner {
  /**
   *
   * @param {import('./types').Config} options
   * @param {string[]} [testFiles]
   */
  constructor(options, testFiles) {
    super(options, testFiles)
    this.stackMapper = createStackMapper(this.dir)
    this.url = ''
    this.pageErrored = false
    /** @type {Set<Promise<void>>} */
    this.pendingConsole = new Set()
    /** @type {WeakMap<object, Promise<void>>} */
    this.lastConsole = new WeakMap()

    if (!this.stopped) {
      process.env.DEBUG = [process.env.DEBUG, '-pw:*'].filter(Boolean).join(',')
    }
  }

  assertOptions() {
    assertBrowserOptions(this.options)
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
      // It ends this process once the browser closes, see #handleInterrupt
      handleSIGINT: false,
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

    this.#handleInterrupt()

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
      // `ready` never resolves when the registration fails, and it comes before
      // the worker claims the page, until then requests skip the worker. It may
      // never come, a hard reload under --debug has nothing left to claim the page.
      await page.evaluate(async (timeout) => {
        const { serviceWorker } = navigator
        await serviceWorker.register('/sw-out.js')
        await serviceWorker.ready
        if (!serviceWorker.controller) {
          await new Promise((resolve) => {
            serviceWorker.addEventListener('controllerchange', resolve, {
              once: true,
            })
            setTimeout(resolve, timeout)
          })
        }
      }, SW_CLAIM_TIMEOUT)
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
      await this.runBeforeTests()

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
      await this.runBeforeTests()

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

    // One reload and build at a time, one in the middle of another breaks both.
    // Changes during those get a single one after them. This ends once the tests
    // are loaded, a change while they run reloads them and cancels that run.
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
   * Let the exit hook finish when this process gets interrupted. The listener of
   * the hook only runs once and a library inside Playwright raises the signal again
   * when no other listener is left, so there has to be one. A second interrupt
   * stops waiting for the hook.
   */
  #handleInterrupt() {
    let interrupted = false
    process.on('SIGINT', () => {
      if (interrupted) {
        this.removeFiles()
        process.exit(130)
      }
      interrupted = true
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
    // Read it right away, print it after the messages that came before it from
    // the same thread. A thread stuck in a loop can't answer the read of its last
    // message, that can't hold back the others.
    const read = readConsole(msg, this.stackMapper.map)
    const thread = msg.worker() ?? msg.page() ?? this
    const pending = (this.lastConsole.get(thread) ?? Promise.resolve())
      .then(async () => {
        const print = await read
        print()
      })
      .finally(() => {
        this.pendingConsole.delete(pending)
      })
    this.lastConsole.set(thread, pending)
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

  async #clean() {
    // Whatever is running fails from here on because of the browser closing
    this.stopped = true

    await this.runAfterTests()

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

    // After the browser closed, it can still be using them
    this.removeFiles()
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

    await this.exit(fail, msg)
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
