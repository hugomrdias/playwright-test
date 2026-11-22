/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { fileURLToPath } from 'node:url'
import { watch } from 'chokidar'
import { asyncExitHook } from 'exit-hook'
import { cp } from 'fs/promises'
import path from 'path'
import { BaseRunner } from './base-runner.js'
import { compileSw } from './utils/build-sw.js'
import { colors } from './utils/colors.js'
import {
  AFTER_TESTS_TIMEOUT,
  addWorker,
  assertBrowserOptions,
  build,
  createPolka,
  defaultOptions,
  getPw,
  log,
  readConsole,
  runTimeoutMessage,
  writeEnv,
} from './utils/index.js'
import { createStackMapper } from './utils/stack-map.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const noop = () => undefined
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
// Writing the screenshots and snapshots of a long run takes a while
const TRACE_WAIT = 30_000

/**
 * @typedef {import('playwright-core').Page} Page
 * @typedef {import('playwright-core').BrowserContext} Context
 * @typedef {import('./types.js').RunnerOptions} RunnerOptions
 * @typedef {import('./types.js').RunnerEnv} RunnerEnv
 * @typedef {import('./types.js').CliOptions} CliOptions
 * @typedef {import('./types.js').Config} Config
 * @typedef {import('./types.js').ConfigFn} ConfigFn
 * @typedef {import('./types.js').WorkerdOptions} WorkerdOptions
 */

export class Runner extends BaseRunner {
  /** @type {{ page: Page, ended: boolean, failed: boolean, resolve: (result: { failed: boolean, navigated: boolean }) => void } | undefined} */
  #testWait = undefined
  /** @type {Promise<import('./types.js').CompilerOutput> | undefined} */
  #compiling = undefined

  /**
   *
   * @param {import('./types.js').Config} options
   * @param {string[]} [testFiles]
   */
  constructor(options, testFiles) {
    super(options, testFiles)
    this.stackMapper = createStackMapper(this.dir)
    this.url = ''
    this.pageErrored = false
    /** If the test page crashed */
    this.crashed = false
    /** @type {'' | 'test page' | 'browser'} what closed before the run ended */
    this.closed = ''
    /** @type {Set<Promise<void>>} */
    this.pendingConsole = new Set()
    /** @type {WeakMap<object, Promise<void>>} */
    this.lastConsole = new WeakMap()
    /** @type {WeakSet<import('playwright-core').ConsoleMessage>} */
    this.seenConsole = new WeakSet()
    /** If the context records a trace, see `#startTracing` */
    this.tracing = false
    this.watching = false

    if (!this.stopped) {
      process.env.DEBUG = [process.env.DEBUG, '-pw:*'].filter(Boolean).join(',')
    }
  }

  assertOptions() {
    assertBrowserOptions(this.options)
  }

  async setupContext() {
    const { launchOptions = {} } = this.options
    const headless = launchOptions.headless ?? !this.options.debug
    // optin to new chromium headless for extension testing
    // https://github.com/microsoft/playwright/issues/33566
    const channel =
      launchOptions.channel ?? (this.options.extension ? 'chromium' : undefined)

    // Assign server immediately on listen so cleanup still closes it if another
    // parallel setup step (like invalid browser validation) rejects.
    const serverPromise = createPolka(
      this.dir,
      this.options.cwd,
      this.options.assets
    ).then(({ server, url }) => {
      this.env.PW_SERVER = url
      this.url = url
      this.server = server
      return { server, url }
    })

    // copy files, start http server, and resolve/download playwright in parallel
    const [, , pw] = await Promise.all([
      cp(path.join(__dirname, './../static'), this.dir, { recursive: true }),
      serverPromise,
      getPw(this.options.browser, {
        headless,
        channel,
        executablePath: launchOptions.executablePath,
      }),
    ])

    /** @type {import('playwright-core').LaunchOptions} */
    const pwOptions = {
      ...launchOptions,
      channel,
      headless,
      // It ends this process once the browser closes, see #handleInterrupt
      handleSIGINT: false,
      args: [
        ...(this.options.extension
          ? [
              `--disable-extensions-except=${this.dir}`,
              `--load-extension=${this.dir}`,
            ]
          : []),
        ...(this.options.browser === 'chromium' && this.options.debug
          ? ['--auto-open-devtools-for-tabs']
          : []),
        ...(launchOptions.args ?? []),
      ],
    }

    this.#handleInterrupt()

    // With an empty path Playwright creates the profile in the temp folder and
    // deletes it, also when the exit hook doesn't wait for the browser to close
    this.context = await pw.launchPersistentContext('', {
      ...pwOptions,
      ...this.options.browserContextOptions,
    })

    // Also when it crashes or gets killed, and when --debug users close it. It
    // fires when this process closes it too, which is after `stopped`.
    this.context.on('close', () => {
      this.#browserEnded('browser')
    })

    // Only Chromium reports service workers, the others keep their output.
    // Extension service workers can already be running before tracing starts.
    /** @type {WeakSet<import('playwright-core').Worker>} */
    const trackedWorkers = new WeakSet()
    /** @param {import('playwright-core').Worker} worker */
    const trackServiceWorker = (worker) => {
      if (trackedWorkers.has(worker)) {
        return
      }
      trackedWorkers.add(worker)
      worker.on('console', this.#onConsole)
    }
    this.context.on('serviceworker', trackServiceWorker)
    for (const worker of this.context.serviceWorkers()) {
      trackServiceWorker(worker)
    }

    await this.#startTracing(this.context)

    // Multiplexed bindings of playwright-test/client; a worker running the
    // tests calls them through the page, see `addWorker`. Trusted input goes
    // to the page that calls it, the test page.
    const context = this.context
    /** @type {{ [K in import('./client/types.js').Binding]: (source: { page: Page }, ...args: Parameters<import('./client/types.js').ClientBindings[K]>) => ReturnType<import('./client/types.js').ClientBindings[K]> }} */
    const clientBindings = {
      pwContextSetOffline: async (_source, offline) => {
        await context.setOffline(offline)
      },
      pwContextGrantPermissions: async (_source, permissions, options) => {
        await context.grantPermissions(permissions, options)
      },
      pwContextClearPermissions: async () => {
        await context.clearPermissions()
      },
      pwContextSetGeolocation: async (_source, geolocation) => {
        await context.setGeolocation(geolocation)
      },
      pwContextSetExtraHTTPHeaders: async (_source, headers) => {
        await context.setExtraHTTPHeaders(headers)
      },
      pwContextAddCookies: async (_source, cookies) => {
        await context.addCookies(cookies)
      },
      pwContextCookies: (_source, urls) => context.cookies(urls),
      pwContextClearCookies: async (_source, options) => {
        await context.clearCookies(options)
      },
      pwPageClick: async ({ page }, selector, options) => {
        await page.click(selector, options)
      },
      pwPageKeyboardPress: async ({ page }, key, options) => {
        await page.keyboard.press(key, options)
      },
      pwPageKeyboardType: async ({ page }, text, options) => {
        await page.keyboard.type(text, options)
      },
    }

    await Promise.all([
      context.exposeBinding(
        'pwClientCall',
        (
          /** @type {{ page: Page }} */ source,
          /** @type {import('./client/types.js').Binding} */ name,
          /** @type {unknown[]} */ ...args
        ) => {
          if (!Object.hasOwn(clientBindings, name)) {
            throw new Error(`Unknown playwright-test/client call: ${name}`)
          }
          // @ts-expect-error the argument types of each binding are checked by src/client/index.js
          return clientBindings[name](source, ...args)
        }
      ),
      context.exposeBinding(
        'PW_TEST_NOTIFY',
        (
          /** @type {{ page: Page, frame: import('playwright-core').Frame }} */ {
            page,
            frame,
          },
          /** @type {boolean} */ failed
        ) => {
          if (frame === page.mainFrame()) {
            this.#onTestEnd(page, Boolean(failed))
          }
        }
      ),
      context.exposeFunction(
        'PW_TEST_STDOUT_WRITE',
        (/** @type {string | Uint8Array} */ msg) =>
          new Promise((resolve, reject) =>
            process.stdout.write(this.stackMapper.map(msg), (error) =>
              error ? reject(error) : resolve(error)
            )
          )
      ),
      context.exposeFunction(
        'PW_TEST_STDERR_WRITE',
        (/** @type {string | Uint8Array} */ msg) =>
          new Promise((resolve, reject) =>
            process.stderr.write(this.stackMapper.map(msg), (error) =>
              error ? reject(error) : resolve(error)
            )
          )
      ),
    ])

    return this.context
  }

  /**
   * Setup Page
   *
   * @param {Context} context
   */
  async setupPage(context) {
    if (this.options.extension) {
      let [serviceWorker] = context.serviceWorkers()
      if (!serviceWorker)
        serviceWorker = await context.waitForEvent('serviceworker')

      const extensionId = serviceWorker.url().split('/')[2]
      this.page = context.pages()[0]
      await this.page.goto(`chrome-extension://${extensionId}/popup.html`)

      if (this.options.debug) {
        // Open the devtools of the extension service worker. It's only a
        // convenience, so when chrome://extensions changes it warns and goes on.
        // Locators pierce the open shadow roots of that page.
        const extPage = await context.newPage()
        try {
          await extPage.goto(`chrome://extensions/?id=${extensionId}`)
          // The toggle is a switch or a button depending on the Chrome version
          const devMode = extPage.locator('#devMode')
          await devMode.waitFor({ timeout: 5000 })
          const on =
            (await devMode.getAttribute('aria-checked')) ??
            (await devMode.getAttribute('aria-pressed'))
          if (on !== 'true') {
            await devMode.click({ timeout: 5000 })
          }
          await extPage
            .getByRole('link', { name: /service worker/i })
            .click({ timeout: 5000 })
        } catch {
          log.warn(
            `Could not open the extension service worker devtools, open chrome://extensions/?id=${extensionId} and click "service worker" by hand.`
          )
        }
      }
    } else {
      this.page = context.pages()[0]
      await this.page.goto(this.url)
    }

    // Setup page events
    this.page.on('console', this.#onConsole)
    this.page.on('crash', () => this.#pageCrashed())
    // Under --debug closing the tab leaves nothing to debug, and on macOS the
    // browser keeps running without windows
    this.page.on('close', () => this.#browserEnded('test page'))

    // uncaught rejections
    this.page.on('pageerror', (err) => {
      this.pageErrored = true
      log.error(
        `Uncaught exception happened within the page. Run with --debug. \n${colors.dim(
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
   * @param {Promise<import('./types.js').CompilerOutput>} [compiled]
   */
  async runTests(page, compiled = this.compiler()) {
    this.stackMapper.reset()
    const swBuild = this.options.sw
      ? compileSw(this, { entry: this.options.sw })
      : undefined
    const debug = [this.env.DEBUG, '-pw:*', '-mocha:*']
      .filter(Boolean)
      .join(',')

    const [{ outName, files: mainFiles }, swOutput] = await Promise.all([
      compiled,
      swBuild,
      writeEnv(this.dir, this.env),
      page.addScriptTag({ url: 'setup.js' }),
      page.evaluate((value) => {
        localStorage.debug = value
      }, debug),
    ])

    const files = [...mainFiles]

    // Inject and register the service worker
    if (swOutput) {
      files.push(...swOutput.files)
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
      wait:
        AFTER_TESTS_TIMEOUT +
        EXIT_WAIT +
        (this.options.trace === 'off' || this.options.debug ? 0 : TRACE_WAIT),
    })

    /** @type {Promise<import('./types.js').CompilerOutput> | undefined} */
    let compiled
    try {
      compiled = this.#compileEarly()
      // Setup the context
      const context = await this.setupContext()
      // After setupContext, downloading a browser doesn't count
      this.#startRunTimeout()
      await this.runBeforeTests()

      // In parallel with setting up the test page
      compiled ??= this.#compile()

      // Setup page
      const page = await this.setupPage(context)

      const testWait = this.options.debug
        ? undefined
        : this.#createTestWait(page)

      try {
        await this.runTests(page, compiled)

        // Re run on page reload
        if (this.options.debug) {
          page.on('load', () => {
            this.runTests(page).catch((error) => {
              console.error(error)
            })
          })
          return
        }

        const result = await /** @type {NonNullable<typeof testWait>} */ (
          testWait
        ).wait()
        if (result.navigated) {
          await this.stop(
            true,
            'The page navigated away from the tests, they have to stay on the page they were loaded in.'
          )
          return
        }

        // Page errors come in order with evaluate results, so they're all in by now
        if (
          !result.failed &&
          !this.pageErrored &&
          this.options.runner !== 'none'
        ) {
          await page.evaluate('0')
        }

        const failed =
          result.failed ||
          // `none` has no tests to fail, the files decide
          (this.pageErrored && this.options.runner !== 'none')

        // exit
        await this.stop(failed, failed ? 'Tests failed.' : undefined)
      } finally {
        testWait?.dispose()
      }
    } catch (/** @type {any} */ error) {
      await this.stop(true, this.#endReason() || error)
    }
  }

  /**
   * @param {Page} page
   * @param {boolean} failed
   */
  #onTestEnd(page, failed) {
    if (this.#testWait?.page === page && !this.#testWait.ended) {
      this.#testWait.ended = true
      this.#testWait.failed = failed
      this.#testWait.resolve({ failed, navigated: false })
    }
  }

  /**
   * Wait for the test page to call `PW_TEST.end()`, navigate away, or close/crash.
   * Armed before `runTests` injects the bundle so synchronous completion or
   * top-level navigation during load is never missed.
   *
   * @param {Page} page
   */
  #createTestWait(page) {
    /** @type {PromiseWithResolvers<{ failed: boolean, navigated: boolean }>} */
    const { promise, resolve, reject } = Promise.withResolvers()
    // Avoid unhandled rejection if `runTests` throws before `wait()` is awaited
    promise.catch(() => undefined)

    const state = {
      page,
      ended: false,
      failed: false,
      resolve,
    }
    this.#testWait = state

    const onCrash = () => {
      reject(new Error('Target crashed'))
    }
    const onClose = () => {
      // Wait a tick so `context`'s close listener can record `browser` first
      setImmediate(() => {
        reject(new Error('Target page, context or browser has been closed'))
      })
    }
    /** @param {import('playwright-core').Frame} frame */
    const onFrameNavigated = (frame) => {
      if (frame !== page.mainFrame() || state.ended) {
        return
      }
      // `history.pushState` and hash changes also fire `framenavigated` without
      // replacing the document; only a real navigation removes `PW_TEST`.
      page.evaluate('globalThis.PW_TEST !== undefined').then(
        (hasController) => {
          if (!hasController && !state.ended) {
            state.ended = true
            resolve({ failed: true, navigated: true })
          }
        },
        () => {
          // Execution context destroyed by another navigation; if the page
          // crashed or closed instead, `onCrash`/`onClose` rejects the wait.
          if (
            !page.isClosed() &&
            !this.crashed &&
            !this.closed &&
            !state.ended
          ) {
            state.ended = true
            resolve({ failed: true, navigated: true })
          }
        }
      )
    }

    page.on('crash', onCrash)
    page.on('close', onClose)
    page.on('framenavigated', onFrameNavigated)

    return {
      wait: async () => {
        if (!state.ended) {
          const snapshot = await page
            .evaluate(() => {
              // @ts-expect-error
              const ctrl = globalThis.PW_TEST
              if (!ctrl) {
                return { navigated: true, ended: true, failed: true }
              }
              return {
                navigated: false,
                ended: ctrl.ended === true,
                failed: Boolean(ctrl.failed),
              }
            })
            .catch(() => undefined)
          if (snapshot?.ended && !state.ended) {
            state.ended = true
            state.failed = snapshot.failed
            resolve({
              failed: snapshot.failed,
              navigated: snapshot.navigated,
            })
          }
        }
        return promise
      },
      dispose: () => {
        page.off('crash', onCrash)
        page.off('close', onClose)
        page.off('framenavigated', onFrameNavigated)
        if (this.#testWait === state) {
          this.#testWait = undefined
        }
      },
    }
  }

  async watch() {
    if (this.stopped) {
      return
    }
    this.watching = true
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

      // Not before the browser starts, the watcher would miss changes until then
      const compiled = this.#compile()

      // Setup page
      page = await this.setupPage(context)

      ;({ files } = await this.runTests(page, compiled))
    } catch (/** @type {any} */ error) {
      await this.stop(true, this.#endReason() || error)
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
            if (navigator.serviceWorker) {
              const regs = await navigator.serviceWorker.getRegistrations()
              await Promise.all(regs.map((reg) => reg.unregister()))
            }
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
   * Record a trace of the run. Not under --debug, the browser closing ends the
   * run there and takes the trace with it, and not in watch mode, which would
   * keep all of the reruns in memory.
   *
   * @param {Context} context
   */
  async #startTracing(context) {
    const { trace, debug } = this.options
    if (trace === 'off') {
      return
    }
    if (debug || this.watching) {
      log.warn(
        `Ignoring --trace, it does not work with ${debug ? '--debug' : '--watch'}.`
      )
      return
    }
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    })
    this.tracing = true
  }

  /**
   * Save the trace, with `retain-on-failure` only when the run failed. Closing
   * the context throws the trace away.
   *
   * @param {number} exitCode
   */
  async #saveTrace(exitCode) {
    if (!this.tracing || (this.options.trace !== 'on' && exitCode === 0)) {
      return
    }
    this.tracing = false
    // The context can be gone before the browser process notices
    if (this.closed === 'browser' || !this.#browserConnected()) {
      log.warn(
        'Could not save the trace, the browser closed before the run ended.'
      )
      return
    }
    const file = path.join(
      this.options.cwd,
      `playwright-test-trace-${this.options.browser}.zip`
    )

    /** @type {NodeJS.Timeout | undefined} */
    let timer
    const saved = await Promise.race([
      /** @type {Context} */ (this.context).tracing.stop({ path: file }).then(
        () => true,
        (/** @type {Error} */ error) => {
          log.warn(`Could not save the trace: ${error.message}`)
          return undefined
        }
      ),
      new Promise((resolve) => {
        timer = setTimeout(resolve, TRACE_WAIT, false)
      }),
    ])
    clearTimeout(timer)

    if (saved) {
      const shown = path.relative(process.cwd(), file) || file
      log.info(
        `Saved the trace, open it with \`npx playwright show-trace ${shown}\`.`
      )
    } else if (saved === false) {
      log.warn(`Timed out saving the trace after ${TRACE_WAIT}ms.`)
    }
  }

  /**
   * If the browser process is still there, it isn't once it crashed or got closed.
   */
  #browserConnected() {
    return this.context?.browser()?.isConnected() ?? false
  }

  /**
   * Why the browser can't finish the run, it wins over the errors that causes.
   * Those can reach `stop` first, the waits of the run reject right away.
   */
  #endReason() {
    if (this.crashed) {
      return 'The test page crashed, it may have run out of memory.'
    }
    if (this.closed) {
      return `The ${this.closed} closed before the tests ended.`
    }
    return ''
  }

  /**
   * End the run, the browser or the test page is gone and can't finish it. Under
   * --debug that's how users end it, whatever the tests did.
   *
   * @param {'browser' | 'test page'} what
   */
  #browserEnded(what) {
    // The browser closing closes the test page first, then the context in the
    // same tick. Recorded right away, the reason is ready for whatever comes next.
    if (what === 'browser' || !this.closed) {
      this.closed = what
    }
    if (this.stopped) {
      return
    }
    if (what === 'test page') {
      // A stop now would say the page closed when the whole browser did
      setImmediate(() => this.#stopClosed())
    } else {
      this.#stopClosed()
    }
  }

  #stopClosed() {
    if (this.options.debug) {
      this.stop(true, `The ${this.closed} closed, ending the debug run.`, true)
    } else {
      this.stop(true, this.#endReason())
    }
  }

  /**
   * Nothing is left to finish the run, Playwright can't use a crashed page again.
   * Under --debug the browser stays open like with other failures.
   */
  #pageCrashed() {
    if (this.stopped) {
      return
    }
    this.crashed = true
    this.stop(true, this.#endReason())
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
    // Playwright emits the same ConsoleMessage on both a service worker and
    // any in-scope page listening to console events.
    if (this.seenConsole.has(msg)) {
      return
    }
    this.seenConsole.add(msg)

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

  /**
   * @param {number} exitCode
   */
  async #clean(exitCode) {
    // Whatever is running fails from here on because of the browser closing
    this.stopped = true

    await this.runAfterTests()
    // Before the close, it has its own wait
    await this.#saveTrace(exitCode)

    const close = async () => {
      // Before the server, its open connections could use up the wait for the exit
      // A browser that's gone can't close it, and doesn't need to
      if (this.context && this.#browserConnected()) {
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

    // After the browser closed, it can still be using them. A bundle started
    // early may still be writing when the setup failed.
    await this.#compiling?.then(noop, noop)
    this.removeFiles()
  }

  /**
   * @param {boolean} fail
   * @param {string | undefined} [msg]
   * @param {boolean} [force] - also under --debug, there's nothing left to debug
   */
  async stop(fail, msg, force = false) {
    if (this.stopped) {
      return
    }
    // The browser stays open to debug the failure, without one there's nothing to
    if (this.options.debug && this.context && !force) {
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
   * Start the bundle of the tests, it fails the run where it's awaited.
   */
  #compile() {
    const compiled = this.compiler()
    // Avoid unhandled rejection if something fails before it gets awaited
    compiled.catch(noop)
    this.#compiling = compiled
    return compiled
  }

  /**
   * Bundle while the browser starts, the env it needs comes later in
   * `envFile`. Not with a `beforeTests` hook, it could make files the tests import.
   */
  #compileEarly() {
    return this.options.beforeTests === defaultOptions.beforeTests
      ? this.#compile()
      : undefined
  }

  /**
   * Compile tests
   *
   * @returns {Promise<import('./types.js').CompilerOutput>} file to be loaded in the page
   */
  compiler() {
    return build(
      this,
      this.options.testRunner.buildConfig?.(this.options),
      this.options.testRunner.compileRuntime(
        this.options,
        this.tests.map((t) => t.replaceAll('\\', '/'))
      )
    )
  }
}
