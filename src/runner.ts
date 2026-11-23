/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { fileURLToPath } from 'node:url'
import { watch } from 'chokidar'
import fs, { mkdirSync } from 'fs'
import { cp } from 'fs/promises'
import os from 'os'
import path from 'path'
import type {
  ConsoleMessage,
  BrowserContext as Context,
  Frame,
  LaunchOptions,
  Page,
  Worker,
} from 'playwright-core'
import { BaseRunner, REMOVE_WAIT, removeFolder } from './base-runner.ts'
import type { Binding, ClientBindings } from './client/types.ts'
import { type FileStatus, summary } from './node/each-file.ts'
import type { CompilerOutput, Config } from './types.ts'
import { compileSw } from './utils/build-sw.ts'
import { colors } from './utils/colors.ts'
import { FileOutput } from './utils/file-output.ts'
import {
  addWorker,
  assertBrowserOptions,
  build,
  defaultOptions,
  getPw,
  log,
  readConsole,
  withTimeout,
  writeEnv,
} from './utils/index.ts'
import { CLEAR_SITE_DATA_PATH, startServer } from './utils/server.ts'
import { createStackMapper } from './utils/stack-map.ts'

export type { BrowserContext as Context, Page } from 'playwright-core'
export type {
  CliOptions,
  Config,
  ConfigFn,
  RunnerEnv,
  RunnerOptions,
  WorkerdOptions,
} from './types.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const noop = () => undefined
// Tests of stuck pages lower it, they always wait for all of it
const CONSOLE_FLUSH_TIMEOUT =
  Number(process.env.PW_TEST_CONSOLE_FLUSH_TIMEOUT) || 5000
// Firefox on GitHub's Windows runners can take close to 3s to close, and the
// browser profile can't be deleted until it does. Tests of slow afterTests
// hooks lower it, to outlast it in less time.
const EXIT_WAIT = Number(process.env.PW_TEST_EXIT_WAIT) || 5000
// Saving many files at once changes them within the poll of the watcher
const WATCH_DEBOUNCE = 200
// Tests of workers that never claim the page lower it
const SW_CLAIM_TIMEOUT = Number(process.env.PW_TEST_SW_CLAIM_TIMEOUT) || 5000
// Writing the screenshots and snapshots of a long run takes a while
const TRACE_WAIT = 30_000

/** The trace written into the folder of the run, or why it couldn't be */
type Trace = { file: string } | { problem: string } | undefined

/** How the tests of a page ended, see `#createTestWait` */
interface TestResult {
  failed: boolean
  navigated: boolean
  /** Ended by the run, like when another file failed with mocha's bail */
  cancelled?: boolean
}

/** The bundles of a run, ready to load in pages */
interface Prepared {
  outNames: string[]
  files: string[]
  sw: boolean
}

export class Runner extends BaseRunner {
  declare stackMapper: { reset(): void; map<T>(value: T): T }
  declare url: string
  declare pageErrored: boolean
  declare crashed: boolean
  declare closed: '' | 'test page' | 'browser'
  declare pendingConsole: Set<Promise<void>>
  declare lastConsole: WeakMap<object, Promise<void>>
  declare seenConsole: WeakSet<ConsoleMessage>
  declare tracing: boolean
  declare watching: boolean
  declare context: Context | undefined
  declare page: Page | undefined

  #testWaits: Map<
    Page,
    {
      ended: boolean
      failed: boolean
      resolve: (result: TestResult) => void
    }
  > = new Map()
  /** With `--test-isolation process`, the file each page runs */
  #pageFile: Map<Page, number> = new Map()
  /** The page that started each worker */
  #workerPage: WeakMap<Worker, Page> = new WeakMap()
  /** The files whose page had an uncaught error */
  #erroredFiles: Set<number> = new Set()
  #output: FileOutput | undefined = undefined
  /** How the files of an isolated run ended, printed by `stop` */
  #summary: (() => void) | undefined = undefined
  #compiling: Promise<CompilerOutput> | undefined = undefined
  #launching: Promise<Context> | undefined = undefined
  #closing: { traced: Promise<Trace>; closed: Promise<void> } | undefined =
    undefined

  constructor(options: Config, testFiles?: string[]) {
    super(options, testFiles)
    this.stackMapper = createStackMapper(this.files)
    this.url = ''
    this.pageErrored = false
    /** If the test page crashed */
    this.crashed = false
    this.closed = ''
    this.pendingConsole = new Set()
    this.lastConsole = new WeakMap()
    this.seenConsole = new WeakSet()
    /** If the context records a trace, see `#startTracing` */
    this.tracing = false
    this.watching = false

    process.env.DEBUG = [process.env.DEBUG, '-pw:*'].filter(Boolean).join(',')
    // Before the bundles, the copy of the static files and a build started
    // early would both make it
    mkdirSync(this.files, { recursive: true })
  }

  assertOptions() {
    assertBrowserOptions(this.options)
  }

  async setupContext() {
    const { launchOptions = {} } = this.options
    const headless = launchOptions.headless ?? !this.options.debug
    const { channel } = launchOptions

    // Assign server immediately on listen so cleanup still closes it if another
    // parallel setup step (like invalid browser validation) rejects.
    const serverPromise = startServer(
      this.files,
      this.options.cwd,
      this.options.assets
    ).then(({ server, url }) => {
      this.env.PW_SERVER = url
      this.url = url
      this.server = server
      return { server, url }
    })

    const copied = cp(path.join(__dirname, './../static'), this.files, {
      recursive: true,
    })
    const pwPromise = getPw(this.options.browser, {
      headless,
      channel,
      executablePath: launchOptions.executablePath,
    })

    const pwOptions: LaunchOptions = {
      ...launchOptions,
      channel,
      headless,
      // It ends this process once the browser closes, see `handleExit`
      handleSIGINT: false,
      args: [
        ...(this.options.browser === 'chromium' && this.options.debug
          ? ['--auto-open-devtools-for-tabs']
          : []),
        ...(launchOptions.args ?? []),
      ],
    }

    // The browser starts while the files get copied and the server starts. Not
    // once the run stopped, another step can fail while Playwright is still
    // getting ready. `stopTests` waits for a browser that's already starting.
    // Deleted with the files of the run once the browser is gone.
    const launching = pwPromise.then((pw) => {
      if (this.stopped) {
        throw new Error('The run stopped before the browser started')
      }
      this.#launching = pw.launchPersistentContext(this.#profile(), {
        ...pwOptions,
        ...this.options.browserContextOptions,
      })
      return this.#launching
    })
    // Avoid unhandled rejection when another step fails first
    launching.catch(noop)

    await Promise.all([copied, serverPromise, launching])
    this.context = await launching

    // Also when it crashes or gets killed, and when --debug users close it. It
    // fires when this process closes it too, which is after `stopped`.
    this.context.on('close', () => {
      this.#browserEnded('browser')
    })

    // Only Chromium reports service workers, the others keep their output.
    // The ones of an extension loaded with `launchOptions.args` can already be
    // running, and get reported again with the event.
    const trackedWorkers: WeakSet<Worker> = new WeakSet()
    const trackServiceWorker = (worker: Worker) => {
      if (!trackedWorkers.has(worker)) {
        trackedWorkers.add(worker)
        worker.on('console', this.#onConsole)
      }
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
    const clientBindings: {
      [K in Binding]: (
        source: { page: Page },
        ...args: Parameters<ClientBindings[K]>
      ) => ReturnType<ClientBindings[K]>
    } = {
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
        (source: { page: Page }, name: Binding, ...args: unknown[]) => {
          if (!Object.hasOwn(clientBindings, name)) {
            throw new Error(`Unknown playwright-test/client call: ${name}`)
          }
          // @ts-expect-error the argument types of each binding are checked by src/client/index.js
          return clientBindings[name](source, ...args)
        }
      ),
      context.exposeBinding(
        'PW_TEST_NOTIFY',
        ({ page, frame }: { page: Page; frame: Frame }, failed: boolean) => {
          if (frame === page.mainFrame()) {
            this.#onTestEnd(page, Boolean(failed))
          }
        }
      ),
      context.exposeBinding(
        'PW_TEST_STDOUT_WRITE',
        ({ page }: { page: Page }, msg: string | Uint8Array) =>
          this.#write(page, process.stdout, msg)
      ),
      context.exposeBinding(
        'PW_TEST_STDERR_WRITE',
        ({ page }: { page: Page }, msg: string | Uint8Array) =>
          this.#write(page, process.stderr, msg)
      ),
    ])

    return this.context
  }

  /**
   * So storage from an earlier run, or run of watch mode, doesn't leak into
   * this one
   */
  async #clearSiteData(page: Page) {
    await page.goto(new URL(CLEAR_SITE_DATA_PATH, this.url).href)
  }

  /**
   * Setup Page
   */
  async setupPage(context: Context) {
    this.page = context.pages()[0] ?? (await context.newPage())
    this.#watchPage(this.page)
    await this.#clearSiteData(this.page)
    await this.page.goto(this.url)
    await this.page.waitForLoadState('domcontentloaded')

    return this.page
  }

  /**
   * What a test page does that ends or fails the run, and what it prints
   */
  #watchPage(page: Page) {
    page.on('console', this.#onConsole)
    page.on('crash', () => this.#pageCrashed())
    // Under --debug closing the tab leaves nothing to debug, and on macOS the
    // browser keeps running without windows
    page.on('close', () => this.#browserEnded('test page'))
    page.on('worker', (worker) => this.#workerPage.set(worker, page))

    // uncaught rejections
    page.on('pageerror', (err) => {
      const index = this.#pageFile.get(page)
      if (index === undefined) {
        this.pageErrored = true
      } else {
        this.#erroredFiles.add(index)
      }
      // The stack of a syntax error can be empty
      const stack = this.stackMapper.map(err.stack || err.toString())
      this.#print(index, () =>
        log.error(
          `Uncaught exception happened within the page. Run with --debug. \n${colors.dim(stack)}`
        )
      )
    })
  }

  /**
   * Print for the file that runs in `index`, see {@link FileOutput}. True when
   * it printed right away.
   */
  #print(index: number | undefined, print: () => void) {
    if (this.#output) {
      return this.#output.write(index, print)
    }
    print()
    return true
  }

  /**
   * What the page writes to `process.stdout` and `process.stderr`. It waits for
   * the write, but not for the files before its own.
   */
  #write(page: Page, stream: NodeJS.WriteStream, msg: string | Uint8Array) {
    const mapped = this.stackMapper.map(msg)
    return new Promise((resolve, reject) => {
      const now = this.#print(this.#pageFile.get(page), () => {
        stream.write(mapped, (error) =>
          error ? reject(error) : resolve(error)
        )
      })
      if (!now) {
        resolve(undefined)
      }
    })
  }

  /**
   * Run the tests
   */
  async runTests(
    page: Page,
    compiled: Promise<CompilerOutput> = this.compiler()
  ) {
    const [prepared] = await Promise.all([
      this.#prepare(compiled),
      this.#setupTestPage(page),
    ])
    await this.#load(page, prepared, prepared.outNames[0] as string)
    return { files: prepared.files }
  }

  /**
   * The bundles, the service worker and the env of the run, once for all of
   * its pages
   */
  async #prepare(compiled: Promise<CompilerOutput>): Promise<Prepared> {
    this.stackMapper.reset()
    const [{ outNames, files }, swOutput] = await Promise.all([
      compiled,
      this.options.sw ? compileSw(this, { entry: this.options.sw }) : undefined,
      writeEnv(this, this.env),
    ])
    return {
      outNames,
      files: [...files, ...(swOutput?.files ?? [])],
      sw: Boolean(swOutput),
    }
  }

  /**
   * What a test page needs before a bundle loads
   */
  async #setupTestPage(page: Page) {
    const debug = [this.env.DEBUG, '-pw:*', '-mocha:*']
      .filter(Boolean)
      .join(',')
    await Promise.all([
      page.addScriptTag({ url: 'setup.js' }),
      page.evaluate((value) => {
        localStorage.debug = value
      }, debug),
    ])
  }

  /**
   * Load a bundle in the page, or in a worker of the page
   */
  async #load(page: Page, { sw }: Prepared, outName: string) {
    // Inject and register the service worker
    if (sw) {
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
    if (this.options.mode === 'web-worker') {
      await page.evaluate(addWorker(loader))
    } else {
      await page.addScriptTag({ url: loader, type: 'module' })
    }
  }

  async run() {
    this.handleExit()

    let compiled: Promise<CompilerOutput> | undefined
    try {
      compiled = this.#compileEarly()
      // Setup the context
      const context = await this.setupContext()
      // After setupContext, downloading a browser doesn't count
      this.startRunTimeout()
      await this.runBeforeTests()

      // In parallel with setting up the test page
      compiled ??= this.#compile()

      if (this.#isolated()) {
        await this.#runEachFile(context, compiled)
        return
      }

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

        const result = await (testWait as NonNullable<typeof testWait>).wait()
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
    } catch (error) {
      await this.stop(true, this.#endReason() || error)
    }
  }

  #onTestEnd(page: Page, failed: boolean) {
    const state = this.#testWaits.get(page)
    if (state && !state.ended) {
      state.ended = true
      state.failed = failed
      state.resolve({ failed, navigated: false })
    }
  }

  /**
   * With `--test-isolation process` and more than one file: a page per file, at
   * most `--test-concurrency` at once. Not with --debug and --watch, they
   * reload the one test page.
   */
  #isolated() {
    return (
      this.options.testIsolation !== 'none' &&
      this.tests.length > 1 &&
      !this.options.debug &&
      !this.watching
    )
  }

  /**
   * Each file in a page of its own, the pages are reused for the next files.
   * What a file prints comes out in the order of the files, then a summary of
   * them. Mocha's `bail` ends the running files when one fails, and skips the
   * rest.
   */
  async #runEachFile(context: Context, compiled: Promise<CompilerOutput>) {
    const { cwd, testConcurrency, testRunner } = this.options
    const files = this.tests
    const concurrency = Math.min(
      testConcurrency ?? Math.max(os.availableParallelism() - 1, 1),
      files.length
    )
    const { bail = false } = (testRunner.options ?? {}) as { bail?: boolean }
    const bails = testRunner.name === 'mocha' && bail
    this.#output = new FileOutput(files.length)

    // Once, before the files, they share the storage like files share the disk
    const first = Promise.resolve(context.pages()[0] ?? context.newPage()).then(
      async (page) => {
        await this.#clearSiteData(page)
        return page
      }
    )
    const [prepared, ...pages] = await Promise.all([
      this.#prepare(compiled),
      first,
      ...Array.from({ length: concurrency - 1 }, () => context.newPage()),
    ])
    for (const page of pages) {
      this.#watchPage(page)
    }
    this.page = pages[0]

    const results: (FileStatus | undefined)[] = []
    const cancels: Map<number, () => void> = new Map()
    let next = 0
    let stopping = false
    let bailed = false
    let navigated = false

    const worker = async (page: Page) => {
      while (!stopping && !this.stopped && next < files.length) {
        const index = next++
        const result = await this.#runFile(page, prepared, index, cancels)
        if (result.navigated) {
          navigated = true
          stopping = true
          for (const cancel of cancels.values()) {
            cancel()
          }
          return
        }
        const passed = !result.failed && !result.cancelled
        results[index] = { passed, cancelled: Boolean(result.cancelled) }
        if (!passed && bails && !stopping) {
          bailed = true
          stopping = true
          for (const cancel of cancels.values()) {
            cancel()
          }
        }
      }
    }
    await Promise.all(pages.map(worker))

    if (navigated) {
      await this.stop(
        true,
        'The page navigated away from the tests, they have to stay on the page they were loaded in.'
      )
      return
    }
    if (this.stopped) {
      return
    }
    // Skipped by bail
    for (let i = 0; i < files.length; i++) {
      results[i] ??= { passed: false, cancelled: false }
    }
    if (bailed || next === files.length) {
      // After what the cancelled files printed, see `stop`
      this.#summary = () =>
        summary({ cwd, files }, results as FileStatus[], next)
    }
    const failed = results.some((result) => !result?.passed)
    await this.stop(failed, failed ? 'Tests failed.' : undefined)
  }

  /**
   * Run one file in the page, then leave the page blank for the next one
   */
  async #runFile(
    page: Page,
    prepared: Prepared,
    index: number,
    cancels: Map<number, () => void>
  ): Promise<TestResult> {
    this.#pageFile.set(page, index)
    // Bail ends it right away, even while the page is busy or still loading
    const cancelled = Promise.withResolvers<TestResult>()
    let isCancelled = false
    cancels.set(index, () => {
      isCancelled = true
      cancelled.resolve({ failed: true, navigated: false, cancelled: true })
    })
    const run = async (): Promise<TestResult> => {
      await page.goto(this.url)
      const testWait = this.#createTestWait(page)
      try {
        if (isCancelled) {
          return await cancelled.promise
        }
        await this.#setupTestPage(page)
        if (isCancelled) {
          return await cancelled.promise
        }
        await this.#load(page, prepared, prepared.outNames[index] as string)
        const result = await Promise.race([testWait.wait(), cancelled.promise])
        if (result.navigated || result.cancelled) {
          return result
        }
        const none = this.options.runner === 'none'
        // Page errors come in order with evaluate results
        if (!result.failed && !none && !this.#erroredFiles.has(index)) {
          await page.evaluate('0')
        }
        return {
          ...result,
          // `none` has no tests to fail, the files decide
          failed: result.failed || (!none && this.#erroredFiles.has(index)),
        }
      } finally {
        testWait.dispose()
      }
    }
    const running = run()
    let result: TestResult | undefined
    try {
      result = await Promise.race([running, cancelled.promise])
      return result
    } finally {
      cancels.delete(index)
      if (result?.cancelled) {
        // Ends its tests without waiting on them, a busy page never answers.
        // The run is ending and the page isn't used again, what it printed
        // stays with its file and `stop` prints it in order.
        running.catch(noop)
        // The values of what it logged are read from the threads, they're
        // gone after it navigates. As long as `stop` waits for them.
        const threads = [page, ...page.workers()]
        withTimeout(
          Promise.allSettled(
            threads.map((thread) => this.lastConsole.get(thread))
          ),
          CONSOLE_FLUSH_TIMEOUT
        )
          .then(() => page.goto('about:blank'))
          .catch(noop)
      } else {
        await this.#flushPage(page)
        this.#output?.done(index)
        // What the file left running can't print over the next ones
        await page.goto('about:blank').catch(noop)
        this.#pageFile.delete(page)
      }
    }
  }

  /**
   * Wait for what the page and its workers printed so far, like
   * `#flushConsole` does for all of them
   */
  async #flushPage(page: Page) {
    const flush = async () => {
      const workers = page.workers()
      await Promise.allSettled([
        page.evaluate('0'),
        ...workers.map((worker) => worker.evaluate('0')),
      ])
      await Promise.allSettled(
        [page, ...workers].map((thread) => this.lastConsole.get(thread))
      )
      return true
    }
    const flushed = await withTimeout(flush(), CONSOLE_FLUSH_TIMEOUT, false)
    if (!flushed) {
      log.warn(
        'Timed out waiting for browser console output, some may be lost.'
      )
    }
  }

  /**
   * Wait for the test page to call `PW_TEST.end()`, navigate away, or close/crash.
   * Armed before `runTests` injects the bundle so synchronous completion or
   * top-level navigation during load is never missed.
   */
  #createTestWait(page: Page) {
    const { promise, resolve, reject } = Promise.withResolvers<TestResult>()
    // Avoid unhandled rejection if `runTests` throws before `wait()` is awaited
    promise.catch(() => undefined)

    const state = {
      ended: false,
      failed: false,
      resolve,
    }
    this.#testWaits.set(page, state)

    const onCrash = () => {
      reject(new Error('Target crashed'))
    }
    const onClose = () => {
      // Wait a tick so `context`'s close listener can record `browser` first
      setImmediate(() => {
        reject(new Error('Target page, context or browser has been closed'))
      })
    }
    const onFrameNavigated = (frame: Frame) => {
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
        if (this.#testWaits.get(page) === state) {
          this.#testWaits.delete(page)
        }
      },
    }
  }

  async watch() {
    this.watching = true
    this.handleExit()

    let page: Page
    let files: string[]
    try {
      // Setup the context
      const context = await this.setupContext()
      await this.runBeforeTests()

      // Not before the browser starts, the watcher would miss changes until then
      const compiled = this.#compile()

      // Setup page
      page = await this.setupPage(context)

      ;({ files } = await this.runTests(page, compiled))
    } catch (error) {
      await this.stop(true, this.#endReason() || error)
      return
    }

    let running = false
    let pending = false
    let debounce: NodeJS.Timeout | undefined

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
          // Like the first run, without the storage of the one before
          await this.#clearSiteData(page)
          await page.goto(this.url)
          console.error()
          log.info('Reloading tests...')
          const { files } = await this.runTests(page)
          watcher.add([...files])
        } catch (error) {
          // Closing the browser on the way out fails whatever was running
          if (!this.stopped) {
            console.error((error as Error).stack)
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
   * Record a trace of the run. Not under --debug, the browser closing ends the
   * run there and takes the trace with it, and not in watch mode, which would
   * keep all of the reruns in memory.
   */
  async #startTracing(context: Context) {
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
   * Write the trace of the run into its folder, before the browser closes.
   * Whether it's kept depends on how the run ends, see `#keepTrace`.
   */
  async #writeTrace(): Promise<Trace> {
    if (!this.tracing) {
      return undefined
    }
    this.tracing = false
    // The context can be gone before the browser process notices
    if (this.closed === 'browser' || !this.#browserConnected()) {
      return {
        problem:
          'Could not save the trace, the browser closed before the run ended.',
      }
    }
    const file = path.join(this.dir, 'trace.zip')
    // Closing the context throws the trace away
    return await withTimeout<Trace, Trace>(
      (this.context as Context).tracing.stop({ path: file }).then(
        () => ({ file }),
        (error: Error) => ({
          problem: `Could not save the trace: ${error.message}`,
        })
      ),
      TRACE_WAIT,
      { problem: `Timed out saving the trace after ${TRACE_WAIT}ms.` }
    )
  }

  /**
   * Keep the trace in `cwd` with `on` or when the run failed, the afterTests
   * hook included. Otherwise it goes with the files of the run.
   */
  async #keepTrace(trace: Trace, exitCode: number) {
    if (!trace || (this.options.trace !== 'on' && exitCode === 0)) {
      return
    }
    if ('problem' in trace) {
      log.warn(trace.problem)
      return
    }
    const file = path.join(
      this.options.cwd,
      `playwright-test-trace-${this.options.browser}.zip`
    )
    // Not a rename, the temp folder can be on another drive. Copied next to
    // it first, a copy that doesn't finish can't replace the trace of another
    // run. With its own wait, where it goes can be slow.
    const copy = `${file}.${process.pid}.tmp`
    let timedOut = false
    const copied = await withTimeout(
      fs.promises
        .copyFile(trace.file, copy)
        .then(() => {
          // Too late, another run may have kept its trace there since
          if (timedOut) {
            return fs.promises.rm(copy, { force: true }).then(() => false)
          }
          return fs.promises.rename(copy, file).then(() => true)
        })
        .catch((error: Error) => {
          fs.promises.rm(copy, { force: true }).catch(noop)
          log.warn(`Could not save the trace: ${error.message}`)
          return false
        }),
      TRACE_WAIT,
      'timed out'
    )
    if (copied === 'timed out') {
      timedOut = true
      log.warn(`Timed out saving the trace after ${TRACE_WAIT}ms.`)
    }
    if (copied !== true) {
      return
    }
    const shown = path.relative(process.cwd(), file) || file
    log.info(
      `Saved the trace, open it with \`npx playwright show-trace ${shown}\`.`
    )
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
   */
  #browserEnded(what: 'browser' | 'test page') {
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
   * Print a console message and keep track of it until it's done
   */
  #onConsole = (msg: ConsoleMessage) => {
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
    const worker = msg.worker()
    const thread = worker ?? msg.page() ?? this
    // The file it belongs to now, its page can run the next one by the time
    // it prints
    const page = msg.page() ?? (worker && this.#workerPage.get(worker))
    const index = page ? this.#pageFile.get(page) : undefined
    const pending = (this.lastConsole.get(thread) ?? Promise.resolve())
      .then(async () => {
        const print = await read
        this.#print(index, print)
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

    const flushed = await withTimeout(flush(), CONSOLE_FLUSH_TIMEOUT, false)
    if (!flushed) {
      log.warn(
        'Timed out waiting for browser console output, some may be lost.'
      )
    }
  }

  /**
   * The files of the tests, the bundles and the env, served to the page.
   */
  get files() {
    return path.join(this.dir, 'tests')
  }

  /**
   * Deleted after the browser closed, see `cleanUp`
   */
  #profile() {
    return path.join(this.dir, 'profile')
  }

  /**
   * Save the trace and close the browser, the tests are done.
   */
  #closeBrowser() {
    if (!this.#closing) {
      const traced = this.#writeTrace()
      const closed = traced
        .then(() => {
          // A browser that's gone can't close it, and doesn't need to
          if (this.context && this.#browserConnected()) {
            return this.context.close()
          }
        })
        .catch((error: Error) => {
          log.warn(`Could not close the browser: ${error.message}`)
        })
      this.#closing = { traced, closed }
    }
    return this.#closing
  }

  /**
   * Writing the trace and copying it where it's kept, the waits of a browser
   * starting and closing, and deleting its profile.
   */
  cleanupWait() {
    const tracing = !(
      this.options.trace === 'off' ||
      this.options.debug ||
      this.watching
    )
    return 3 * EXIT_WAIT + REMOVE_WAIT + (tracing ? 2 * TRACE_WAIT : 0)
  }

  /**
   * Close the browser, the tests in it can't use what the afterTests hook
   * stops. The trace gets written first, it has its own wait.
   */
  async stopTests() {
    // A browser that's still starting would keep using the profile, or make it
    // again after it got deleted
    if (this.#launching && !this.context) {
      await withTimeout(
        this.#launching.then((context) => {
          this.context = context
        }, noop),
        EXIT_WAIT
      )
    }
    const closing = this.#closeBrowser()
    // Right away without a trace, so a slow close can't use up its wait
    await closing.traced
    await withTimeout(closing.closed, EXIT_WAIT)
  }

  async cleanUp(exitCode: number) {
    const closing = this.#closeBrowser()
    // It has its own wait. Kept by the exit code, the hook can fail the run.
    await this.#keepTrace(await closing.traced, exitCode)
    // Still closing when the wait in `stopTests` ran out. Before the server,
    // the open connections of the browser would keep it open.
    await withTimeout(closing.closed, EXIT_WAIT)
    // The bundles don't go there, a build that never ends can't keep it
    await removeFolder(this.#profile())
    // After the browser closed, it can still be using them. A bundle started
    // early may still be writing when the setup failed.
    await this.#compiling?.then(noop, noop)
  }

  /**
   * @param force - also under --debug, there's nothing left to debug
   */
  async stop(fail: boolean, msg?: unknown, force: boolean = false) {
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
    // What files that didn't end printed, before the reason the run ended
    this.#output?.flushAll()
    this.#summary?.()

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
   * @returns file to be loaded in the page
   */
  compiler(): Promise<CompilerOutput> {
    const { testRunner } = this.options
    const tests = this.tests.map((t) => t.replaceAll('\\', '/'))
    return build(
      this,
      testRunner.buildConfig?.(this.options),
      this.#isolated()
        ? tests.map((test) => testRunner.compileRuntime(this.options, [test]))
        : testRunner.compileRuntime(this.options, tests)
    )
  }
}
