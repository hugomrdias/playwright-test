/** biome-ignore-all lint/suspicious/noConsole: its ok */
/**
 * `node:test` compatible API that runs in browsers and in Node.js, on top of
 * the taps queue, reporting and `exec`/`hold` flow.
 *
 * The behaviour follows `lib/internal/test_runner/test.js` from Node.js, with
 * two structural differences:
 *
 * - Tests always run serially. Which makes a single `current` pointer a good
 *   enough replacement for the async context tracking Node.js uses to find the
 *   parent of a global `test()` call, and that isn't available in browsers.
 * - Top level tests wait for `exec()` instead of the end of the build phase,
 *   unless their promise is awaited, see {@link LazyTestPromise}.
 */
import kleur from 'kleur'
import { start } from '../taps/exec.js'
import { formatError, log, TAPS_QUEUE } from '../taps/harness.js'
// Before the queue push below, so with both entrypoints the order of the queue
// is always the same. Whichever one is imported first.
import { exec, hold } from '../taps/index.js'
import { formatObj, hrtime, IS_NODE } from '../taps/utils.js'
import { legacy as nodeAssert } from './assert.js'
import { MockTracker, unsupported } from './test-mock.js'

/**
 * @typedef {'before' | 'after' | 'beforeEach' | 'afterEach'} HookName
 * @typedef {{ ctx: TestContext | SuiteContext }} RunArgs
 */

const kAborted = 'testAborted'
const kCallbackAndPromisePresent = 'callbackAndPromisePresent'
const kCancelledByParent = 'cancelledByParent'
const kHookFailure = 'hookFailed'
const kMultipleCallbackInvocations = 'multipleCallbackInvocations'
const kParentAlreadyFinished = 'parentAlreadyFinished'
const kSubtestsFailed = 'subtestsFailed'
const kTestCodeFailure = 'testCodeFailure'
const kTestTimeoutFailure = 'testTimeoutFailure'
const kUncaughtException = 'uncaughtException'
const kUnhandledRejection = 'unhandledRejection'

/** Failures where the error of the user is what's worth reporting. */
const UNWRAP = new Set([
  kTestCodeFailure,
  kUncaughtException,
  kUnhandledRejection,
])

const TIMEOUT_MAX = 2 ** 31 - 1

const noop = () => {
  // noop
}

class TestFailure extends Error {
  code = 'ERR_TEST_FAILURE'

  /**
   * @param {any} error
   * @param {string} failureType
   */
  constructor(error, failureType) {
    super(error?.message ?? String(error))
    this.failureType = failureType
    this.cause = error
  }
}

function deferred() {
  /** @type {(value?: any) => void} */
  let resolve = noop
  /** @type {(reason?: any) => void} */
  let reject = noop
  /** @type {Promise<void>} */
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Run an async function once, and keep returning its promise.
 *
 * @param {() => Promise<void>} fn
 */
function runOnce(fn) {
  /** @type {Promise<void> | undefined} */
  let promise
  return () => {
    promise ??= fn()
    return promise
  }
}

/**
 * A promise that resolves when the signal aborts or, with a timeout, rejects
 * when either of them happen.
 *
 * @param {number | null} timeout
 * @param {AbortSignal} signal
 */
function stopTest(timeout, signal) {
  const { promise, resolve } = deferred()
  const onAbort = () => resolve()
  /** @type {any} */
  let timer

  if (signal.aborted) {
    queueMicrotask(onAbort)
  } else {
    signal.addEventListener('abort', onAbort, { once: true })
  }

  const dispose = () => {
    signal.removeEventListener('abort', onAbort)
    clearTimeout(timer)
  }

  if (timeout === null) {
    return { promise, dispose }
  }

  timer = setTimeout(onAbort, timeout)
  return {
    promise: promise.then(() => {
      throw new TestFailure(
        `test timed out after ${timeout}ms`,
        kTestTimeoutFailure
      )
    }),
    dispose,
  }
}

/**
 * Call a test or hook function, which can be sync, async or take a callback.
 *
 * @param {Function} fn
 * @param {TestContext | SuiteContext} ctx
 * @param {(err: TestFailure) => void} fail
 */
function invoke(fn, ctx, fail) {
  if (fn.length !== 2) {
    return Promise.resolve(fn.call(ctx, ctx))
  }

  // Error-first callback style `(t, done) => {}`
  const { promise, resolve, reject } = deferred()
  let calledCount = 0
  const ret = fn.call(ctx, ctx, (/** @type {unknown} */ err) => {
    calledCount++
    // Let the user know about a second call, this ends up as an uncaught error.
    if (calledCount === 2) {
      throw new TestFailure(
        'callback invoked multiple times',
        kMultipleCallbackInvocations
      )
    }
    if (calledCount > 1) {
      return
    }
    if (err) {
      reject(err)
    } else {
      resolve()
    }
  })

  if (typeof ret?.then === 'function') {
    fail(
      new TestFailure(
        'passed a callback but also returned a Promise',
        kCallbackAndPromisePresent
      )
    )
    return Promise.resolve(ret)
  }
  return promise
}

/**
 * @param {unknown} timeout
 * @param {string} name
 */
function validateTimeout(timeout, name) {
  if (
    typeof timeout !== 'number' ||
    Number.isNaN(timeout) ||
    timeout < 0 ||
    timeout > TIMEOUT_MAX
  ) {
    throw new RangeError(
      `The value of "${name}" must be a number >= 0 && <= ${TIMEOUT_MAX}.`
    )
  }
}

class TestPlan {
  #waitIndefinitely = false
  /** @type {ReturnType<typeof deferred> | null} */
  #planPromise = null
  /** @type {any} */
  #timeoutId = null

  /**
   * @param {number} count
   * @param {{ wait?: boolean | number }} [options]
   */
  constructor(count, options = {}) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('The value of "count" must be an integer >= 0.')
    }
    const { wait } = options
    if (typeof wait === 'boolean') {
      this.wait = wait
      this.#waitIndefinitely = wait
    } else if (typeof wait === 'number') {
      validateTimeout(wait, 'options.wait')
      this.wait = wait
    } else if (wait !== undefined) {
      throw new TypeError(
        'The "options.wait" property must be a boolean or a number.'
      )
    }
    this.expected = count
    this.actual = 0
  }

  check() {
    if (this.actual === this.expected) {
      clearTimeout(this.#timeoutId)
      this.#planPromise?.resolve()
      this.#planPromise = null
      return
    }

    if (this.wait === undefined || this.wait === false) {
      throw new TestFailure(
        `plan expected ${this.expected} assertions but received ${this.actual}`,
        kTestCodeFailure
      )
    }

    if (this.#planPromise) {
      return this.#planPromise.promise
    }

    const planPromise = deferred()
    this.#planPromise = planPromise
    if (!this.#waitIndefinitely) {
      this.#timeoutId = setTimeout(
        () => {
          planPromise.reject(
            new TestFailure(
              `plan timed out after ${this.wait}ms with ${this.actual} assertions when expecting ${this.expected}`,
              kTestTimeoutFailure
            )
          )
        },
        /** @type {number} */ (this.wait)
      )
    }

    return planPromise.promise
  }

  count() {
    this.actual++
    if (this.#planPromise) {
      this.check()
    }
  }
}

const ASSERT_METHODS = [
  'deepEqual',
  'deepStrictEqual',
  'doesNotMatch',
  'doesNotReject',
  'doesNotThrow',
  'equal',
  'fail',
  'ifError',
  'match',
  'notDeepEqual',
  'notDeepStrictEqual',
  'notEqual',
  'notStrictEqual',
  'ok',
  'partialDeepStrictEqual',
  'rejects',
  'strictEqual',
  'throws',
]

/** @type {Map<string, Function>} */
const registeredAssertions = new Map()

class TestContext {
  /** @type {Record<string, Function> | undefined} */
  #assert
  #test

  /**
   * @param {Test} test
   */
  constructor(test) {
    this.#test = test
  }

  get signal() {
    return this.#test.signal
  }

  get name() {
    return this.#test.name
  }

  get filePath() {
    return undefined
  }

  get fullName() {
    return getFullName(this.#test)
  }

  get error() {
    return this.#test.error
  }

  get passed() {
    return this.#test.passed
  }

  get attempt() {
    return 0
  }

  get tags() {
    return this.#test.tags
  }

  get workerId() {
    return undefined
  }

  /**
   * @param {string} message
   */
  diagnostic(message) {
    this.#test.diagnostics.push(message)
  }

  /**
   * @param {string} message
   * @param {unknown} [data]
   */
  log(message, data) {
    console.log(...(data === undefined ? [message] : [message, data]))
  }

  /**
   * @param {number} count
   * @param {{ wait?: boolean | number }} [options]
   */
  plan(count, options) {
    if (this.#test.plan !== null) {
      throw new TestFailure('cannot set plan more than once', kTestCodeFailure)
    }
    this.#test.plan = new TestPlan(count, options)
  }

  get assert() {
    if (this.#assert === undefined) {
      const test = this.#test
      /** @type {Record<string, Function>} */
      const assert = Object.create(null)
      /**
       * @param {string} name
       * @param {Function} method
       */
      const add = (name, method) => {
        assert[name] = (/** @type {unknown[]} */ ...args) => {
          test.plan?.count()
          return method.apply(this, args)
        }
      }

      for (const name of ASSERT_METHODS) {
        add(name, nodeAssert[/** @type {keyof typeof nodeAssert} */ (name)])
      }
      assert.snapshot = () => unsupported('t.assert.snapshot()')
      assert.fileSnapshot = () => unsupported('t.assert.fileSnapshot()')
      for (const [name, method] of registeredAssertions) {
        add(name, method)
      }
      this.#assert = assert
    }
    return this.#assert
  }

  get mock() {
    this.#test.mock ??= new MockTracker()
    return this.#test.mock
  }

  /**
   * @param {boolean} value
   */
  runOnly(value) {
    this.#test.runOnlySubtests = !!value
  }

  /**
   * @param {string} [message]
   */
  skip(message) {
    this.#test.skipped = true
    this.#test.message = message
  }

  /**
   * @param {string} [message]
   */
  todo(message) {
    this.#test.isTodo = true
    this.#test.message = message
  }

  /**
   * @param {any} [name]
   * @param {any} [options]
   * @param {any} [fn]
   */
  test(name, options, fn) {
    this.#test.plan?.count()
    const subtest = this.#test.createSubtest(Test, name, options, fn)
    return startOrQueue(subtest, this.#test)
  }

  /**
   * @param {any} fn
   * @param {any} [options]
   */
  before(fn, options) {
    this.#test.createHook('before', fn, options)
  }

  /**
   * @param {any} fn
   * @param {any} [options]
   */
  after(fn, options) {
    this.#test.createHook('after', fn, options)
  }

  /**
   * @param {any} fn
   * @param {any} [options]
   */
  beforeEach(fn, options) {
    this.#test.createHook('beforeEach', fn, options)
  }

  /**
   * @param {any} fn
   * @param {any} [options]
   */
  afterEach(fn, options) {
    this.#test.createHook('afterEach', fn, options)
  }

  /**
   * @template T
   * @param {() => T | Promise<T>} condition
   * @param {{ interval?: number, timeout?: number }} [options]
   * @returns {Promise<T>}
   */
  waitFor(condition, options = {}) {
    if (typeof condition !== 'function') {
      throw new TypeError('The "condition" argument must be of type function.')
    }
    const { interval = 50, timeout = 1000 } = options
    validateTimeout(interval, 'options.interval')
    validateTimeout(timeout, 'options.timeout')

    return new Promise((resolve, reject) => {
      /** @type {unknown} */
      let cause
      let failed = false
      /** @type {any} */
      let pollerId
      const timeoutId = setTimeout(() => {
        clearTimeout(pollerId)
        const err = new Error('waitFor() timed out')
        if (failed) {
          err.cause = cause
        }
        reject(err)
      }, timeout)

      const poller = async () => {
        try {
          const result = await condition()
          clearTimeout(timeoutId)
          resolve(result)
        } catch (err) {
          cause = err
          failed = true
          pollerId = setTimeout(poller, interval)
        }
      }

      poller()
    })
  }
}

class SuiteContext {
  #suite

  /**
   * @param {Test} suite
   */
  constructor(suite) {
    this.#suite = suite
  }

  get signal() {
    return this.#suite.signal
  }

  get name() {
    return this.#suite.name
  }

  get filePath() {
    return undefined
  }

  get fullName() {
    return getFullName(this.#suite)
  }

  get passed() {
    return this.#suite.passed
  }

  get attempt() {
    return 0
  }

  /**
   * @param {string} message
   */
  diagnostic(message) {
    this.#suite.diagnostics.push(message)
  }

  /**
   * @param {string} message
   * @param {unknown} [data]
   */
  log(message, data) {
    console.log(...(data === undefined ? [message] : [message, data]))
  }
}

class TestHook {
  /** @type {TestFailure | Error | null} */
  error = null
  /** @type {Promise<void> | undefined} */
  promise

  /**
   * @param {HookName} hookType
   * @param {any} fn
   * @param {{ timeout?: number | null, signal?: AbortSignal }} options
   */
  constructor(hookType, fn, { timeout, signal } = {}) {
    if (timeout != null && timeout !== Number.POSITIVE_INFINITY) {
      validateTimeout(timeout, 'options.timeout')
    }
    this.hookType = hookType
    this.fn = typeof fn === 'function' ? fn : noop
    this.timeout =
      timeout == null || timeout === Number.POSITIVE_INFINITY ? null : timeout
    this.outerSignal = signal
  }

  /**
   * @param {RunArgs} args
   */
  run(args) {
    if (this.hookType === 'before' || this.hookType === 'after') {
      this.promise ??= this.#run(args)
      return this.promise
    }
    return this.#run(args)
  }

  /**
   * @param {RunArgs} args
   */
  async #run({ ctx }) {
    this.error = null
    const stop = stopTest(
      this.timeout,
      this.outerSignal ?? new AbortController().signal
    )
    try {
      await Promise.race([
        invoke(this.fn, ctx, (err) => {
          this.error = err
        }),
        stop.promise,
      ])
      if (this.outerSignal?.aborted) {
        throw abortError(this.outerSignal)
      }
    } catch (err) {
      this.error =
        err instanceof TestFailure ||
        /** @type {any} */ (err)?.failureType === kAborted
          ? /** @type {Error} */ (err)
          : new TestFailure(err, kTestCodeFailure)
    } finally {
      stop.dispose()
    }
  }
}

/**
 * @param {AbortSignal | undefined} signal
 */
function abortError(signal) {
  const reason = signal?.reason
  const error =
    reason !== null && typeof reason === 'object'
      ? reason
      : new DOMException('The test was aborted', 'AbortError')
  error.failureType = kAborted
  return error
}

class Test {
  /** @type {'test' | 'suite'} */
  reportedType = 'test'
  /** @type {any} */
  mock = null
  /** @type {TestPlan | null} */
  plan = null
  /** @type {TestContext | undefined} */
  #ctx
  /** @type {string | undefined | null} */
  message = null
  cancelled = false
  filtered = false
  finished = false
  hasOnlyTests = false
  passed = false
  runOnlySubtests = false
  /** The build of a suite, tests never have one. */
  buildFinished = false
  active = false
  /** @type {any} */
  error = null
  /** @type {(() => string) | null} */
  startTime = null
  /** @type {string[]} */
  diagnostics = []
  /** @type {Test[]} */
  subtests = []
  /** @type {Array<{ test: Test, resolve: () => void }>} */
  pendingSubtests = []
  /** @type {Set<Test>} */
  unfinishedSubtests = new Set()
  /** @type {ReturnType<typeof deferred> | null} */
  subtestsPromise = null
  /** @type {Test | null} */
  previous = null
  errorsAtStart = 0
  done = deferred()
  hooks = {
    /** @type {TestHook[]} */
    before: [],
    /** @type {TestHook[]} */
    after: [],
    /** @type {TestHook[]} */
    beforeEach: [],
    /** @type {TestHook[]} */
    afterEach: [],
    ownAfterEachCount: 0,
  }

  /**
   * @param {any} options
   */
  constructor(options) {
    const { name, parent, concurrency, expectFailure, only, plan } = options
    const { signal, skip, tags, timeout, todo } = options
    let { fn } = options

    if (expectFailure !== undefined && expectFailure !== false) {
      unsupported('options.expectFailure')
    }

    if (typeof fn !== 'function') {
      fn = noop
    }

    this.name =
      typeof name === 'string' && name !== ''
        ? name
        : (fn !== noop && fn.name) || '<anonymous>'
    /** @type {Test | null} */
    this.parent = parent ?? null
    this.only = only
    this.timeout = parent?.timeout ?? null
    /** @type {string[]} */
    this.tags = [...(parent?.tags ?? []), ...(tags ?? [])]

    if (only && parent) {
      // If filtering impacts the tests within a suite, then the suite only runs
      // those tests. If it does not, then all tests are run.
      parent.runOnlySubtests = true

      if (parent === root || parent.startTime === null) {
        globalThis.TAPS_ONLY = true
        for (let t = parent; t !== null && !t.hasOnlyTests; t = t.parent) {
          t.hasOnlyTests = true
        }
      }
    }

    // Accepted to be compatible, tests always run serially
    if (
      concurrency != null &&
      typeof concurrency !== 'number' &&
      typeof concurrency !== 'boolean'
    ) {
      throw new TypeError(
        'The "options.concurrency" property must be a number or a boolean.'
      )
    }

    if (timeout != null && timeout !== Number.POSITIVE_INFINITY) {
      validateTimeout(timeout, 'options.timeout')
      this.timeout = timeout
    }

    if (skip) {
      fn = noop
    }

    this.abortController = new AbortController()
    this.outerSignal = signal
    this.signal = this.abortController.signal
    this.outerSignal?.addEventListener('abort', this.abortHandler)

    this.fn = fn
    this.expectedAssertions = plan
    this.skipped = skip !== undefined && skip !== false
    this.isTodo = (todo !== undefined && todo !== false) || !!parent?.isTodo
    if (typeof skip === 'string') {
      this.message = skip
    } else if (typeof todo === 'string') {
      this.message = todo
    }
  }

  applyFilters() {
    if (this.error || this.only || this.hasOnlyTests) {
      return
    }
    const parent = /** @type {Test} */ (this.parent)
    if (
      parent.runOnlySubtests ||
      parent.hasOnlyTests ||
      // `.only` can come from a `playwright-test/taps` test in another file
      (globalThis.TAPS_ONLY && (parent === root || this.only === false))
    ) {
      this.filtered = true
    }
  }

  /**
   * @param {any} Factory
   * @param {any} [name]
   * @param {any} [options]
   * @param {any} [fn]
   * @param {any} [overrides]
   * @returns {Test}
   */
  createSubtest(Factory, name, options, fn, overrides) {
    if (typeof name === 'function') {
      fn = name
    } else if (name !== null && typeof name === 'object') {
      fn = options
      options = name
    } else if (typeof options === 'function') {
      fn = options
    }

    if (options === null || typeof options !== 'object') {
      options = {}
    }

    // If this test has already ended, attach to the root so the error is reported.
    const prevented = this.finished || this.buildFinished
    const parent = prevented ? root : this

    if (parent === root && rootFinished) {
      throw new Error(
        `Test "${typeof name === 'string' ? name : '<anonymous>'}" was created after the tests finished running. With top level await, await it before the run ends or call hold() and exec().`
      )
    }

    const test = new Factory({ fn, name, ...options, ...overrides, parent })

    if (prevented) {
      test.fail(
        new TestFailure(
          'test could not be started because its parent finished',
          kParentAlreadyFinished
        )
      )
    }

    parent.subtests.push(test)
    return test
  }

  abortHandler = () => {
    this.cancel(abortError(this.outerSignal))
  }

  /**
   * @param {any} [error]
   */
  cancel(error) {
    if (this.finished || this.error !== null) {
      return
    }
    this.fail(
      error ??
        new TestFailure(
          'test did not finish before its parent and was cancelled',
          kCancelledByParent
        )
    )
    this.cancelled = true
    this.abortController.abort()
  }

  computeInheritedHooks() {
    const { beforeEach, afterEach } = /** @type {Test} */ (this.parent).hooks
    this.hooks.beforeEach.unshift(...beforeEach)
    this.hooks.afterEach.push(...afterEach)
  }

  /**
   * @param {HookName} name
   * @param {any} fn
   * @param {any} [options]
   */
  createHook(name, fn, options) {
    const hook = new TestHook(name, fn, options)
    if (name === 'before' && this.startTime !== null) {
      // Already started, run the hook immediately
      hook.run(this.getRunArgs()).then(() => {
        if (hook.error != null) {
          this.fail(hook.error)
        }
      })
    }
    if (name === 'afterEach') {
      // In the order they're created, but before those of any ancestor.
      this.hooks.afterEach.splice(this.hooks.ownAfterEachCount, 0, hook)
      this.hooks.ownAfterEachCount++
    } else {
      this.hooks[name].push(hook)
    }
  }

  /**
   * @param {any} err
   */
  fail(err) {
    if (this.error !== null) {
      return
    }
    this.passed = false
    this.error = err
  }

  pass() {
    if (this.error === null) {
      this.passed = true
    }
  }

  /**
   * @returns {Promise<void>}
   */
  start() {
    this.applyFilters()
    const parent = /** @type {Test} */ (this.parent)

    if (this.filtered) {
      return this.filteredRun()
    }

    parent.addUnfinished(this)
    if (parent.active) {
      const { promise, resolve } = deferred()
      parent.pendingSubtests.push({ test: this, resolve })
      return promise
    }
    return this.run()
  }

  /**
   * @param {Test} subtest
   */
  addUnfinished(subtest) {
    if (this.unfinishedSubtests.size === 0) {
      this.subtestsPromise = deferred()
    }
    this.unfinishedSubtests.add(subtest)
  }

  async processPendingSubtests() {
    while (this.pendingSubtests.length > 0 && !this.active) {
      const next = /** @type {{ test: Test, resolve: () => void }} */ (
        this.pendingSubtests.shift()
      )
      await next.test.run()
      next.resolve()
    }
  }

  getCtx() {
    this.#ctx ??= new TestContext(this)
    return this.#ctx
  }

  /**
   * @returns {RunArgs}
   */
  getRunArgs() {
    return { ctx: this.getCtx() }
  }

  /**
   * @param {HookName} name
   * @param {RunArgs} args
   */
  async runHook(name, args) {
    try {
      for (const hook of this.hooks[name]) {
        await hook.run(args)
        if (hook.error) {
          throw hook.error
        }
      }
    } catch (err) {
      const error = new TestFailure(`failed running ${name} hook`, kHookFailure)
      error.cause = err instanceof TestFailure ? err.cause : err
      throw error
    }
  }

  async filteredRun() {
    this.pass()
    this.subtests = []
    queueMicrotask(() => this.postRun())
    await this.done.promise
  }

  /**
   * Make this test the parent of global `test()` and hook calls.
   */
  enter() {
    this.previous = current
    current = this
  }

  leave() {
    // A cancelled test can get here while a next one is already running.
    if (current === this && this.previous !== null) {
      current = this.previous
    }
  }

  async run() {
    const parent = /** @type {Test} */ (this.parent)
    parent.active = true
    this.computeInheritedHooks()
    this.startTime = hrtime()
    this.errorsAtStart = counters.errors.length
    this.enter()

    if (this.shouldAbort()) {
      this.leave()
      this.postRun()
      return
    }

    const hookArgs = this.getRunArgs()
    const ctx = /** @type {TestContext} */ (hookArgs.ctx)

    const wasSkippedBeforeRun = this.skipped
    const after = async () => {
      if (this.hooks.after.length > 0) {
        await this.runHook('after', hookArgs)
      }
    }
    const afterEach = runOnce(async () => {
      if (parent.hooks.afterEach.length > 0 && !wasSkippedBeforeRun) {
        await parent.runHook('afterEach', hookArgs)
      }
    })

    /** @type {ReturnType<typeof stopTest> | undefined} */
    let stop

    try {
      if (this.plan === null && this.expectedAssertions) {
        ctx.plan(this.expectedAssertions)
      }
      if (parent.hooks.before.length > 0) {
        await parent.runHook('before', parent.getRunArgs())
      }
      if (parent.hooks.beforeEach.length > 0 && !this.skipped) {
        await parent.runHook('beforeEach', hookArgs)
      }
      stop = stopTest(this.timeout, this.signal)

      await Promise.race([
        invoke(this.fn, ctx, (err) => this.fail(err)),
        stop.promise,
      ])

      this.shouldAbort()

      while (this.unfinishedSubtests.size > 0) {
        await Promise.race([
          /** @type {ReturnType<typeof deferred>} */ (this.subtestsPromise)
            .promise,
          stop.promise,
        ])
        if (this.signal.aborted) {
          break
        }
      }

      const planPromise = this.plan?.check()
      if (planPromise) {
        await Promise.race([planPromise, stop.promise])
      }

      this.pass()
      await afterEach()
      await after()
    } catch (err) {
      if (err instanceof TestFailure) {
        if (err.failureType === kTestTimeoutFailure) {
          this.cancel(err)
        } else {
          this.fail(err)
        }
      } else {
        this.fail(new TestFailure(err, kTestCodeFailure))
      }
      try {
        await afterEach()
      } catch {
        // already failing
      }
      try {
        await after()
      } catch {
        // already failing
      }
    } finally {
      stop?.dispose()
      this.abortController.abort()
      this.leave()
    }

    this.postRun()
  }

  shouldAbort() {
    if (this.signal.aborted || this.outerSignal?.aborted) {
      this.abortHandler()
      return true
    }
    return false
  }

  /**
   * @param {any} [pendingSubtestsError]
   */
  postRun(pendingSubtestsError) {
    if (this.finished) {
      return
    }
    this.finished = true

    // The test has run, so recursively cancel any outstanding subtests and
    // mark this test as failed if any subtests failed.
    this.pendingSubtests = []
    let failed = 0
    for (const subtest of this.subtests) {
      if (!subtest.finished) {
        subtest.cancel(pendingSubtestsError)
        subtest.postRun(pendingSubtestsError)
      }
      if (!subtest.passed && !subtest.isTodo) {
        failed++
      }
    }

    if (this.passed && failed > 0) {
      this.fail(
        new TestFailure(
          `${failed} ${failed > 1 ? 'subtests' : 'subtest'} failed`,
          kSubtestsFailed
        )
      )
    }

    this.outerSignal?.removeEventListener('abort', this.abortHandler)
    this.mock?.reset()

    const parent = /** @type {Test} */ (this.parent)
    if (!this.filtered) {
      this.report()
      parent.active = false
    }

    if (
      parent.unfinishedSubtests.delete(this) &&
      parent.unfinishedSubtests.size === 0
    ) {
      parent.subtestsPromise?.resolve()
    }
    this.done.resolve()
    parent.processPendingSubtests()
  }

  report() {
    const time = this.startTime?.() ?? '0.00ms'
    const suite =
      this.parent === root ? '' : getFullName(/** @type {Test} */ (this.parent))
    const failed = !(this.passed || this.skipped || this.isTodo)
    const directive = this.skipped ? 'SKIP' : this.isTodo ? 'TODO' : ''
    const name = directive
      ? `${this.name} # ${directive}${this.message ? ` ${this.message}` : ''}`
      : this.name

    if (this.reportedType === 'suite') {
      if (directive) {
        const prefix = suite ? `${suite} > ` : ''
        console.log(`${kleur.yellow(`- ${prefix}${name}`)}`)
      }
    } else {
      if (this.skipped) {
        counters.skips++
      } else if (this.isTodo) {
        counters.todos++
      } else if (!failed) {
        counters.passes++
      }
      counters.total++
      log(
        {
          name,
          suite,
          number: counters.offset + counters.total,
          skip: this.skipped || this.isTodo,
        },
        failed,
        time
      )
    }

    for (const message of this.diagnostics) {
      console.log(`${kleur.blue('ℹ')} ${message}`)
    }

    if (this.error === null) {
      return
    }

    const error = displayError(this.error)
    if (this.isTodo || this.skipped) {
      // Expected to fail, or not meant to run, so it's only worth a mention
      console.log(kleur.gray(`  ${error.name}: ${error.message}`))
    } else if (
      this.error.failureType !== kSubtestsFailed ||
      counters.errors.length === this.errorsAtStart
    ) {
      counters.errors.push(
        formatError({ ...CTX, name: this.name, suite }, error)
      )
    }
  }
}

class Suite extends Test {
  /** @type {'test' | 'suite'} */
  reportedType = 'suite'

  /**
   * @param {any} options
   */
  constructor(options) {
    super(options)
    if (options.timeout == null) {
      this.timeout = null
    }
    this.buildPromise = scheduleBuild(this)
  }

  /**
   * @returns {RunArgs}
   */
  getRunArgs() {
    return { ctx: new SuiteContext(this) }
  }

  async filteredRun() {
    await this.buildPromise
    return super.filteredRun()
  }

  async run() {
    const parent = /** @type {Test} */ (this.parent)
    this.computeInheritedHooks()
    const hookArgs = this.getRunArgs()
    this.errorsAtStart = counters.errors.length

    const after = runOnce(() => this.runHook('after', hookArgs))
    /** @type {ReturnType<typeof stopTest> | undefined} */
    let stop
    try {
      parent.active = true
      await this.buildPromise
      this.startTime = hrtime()
      this.enter()

      if (this.shouldAbort()) {
        this.subtests.length = 0
        this.leave()
        this.postRun()
        return
      }

      if (parent.hooks.before.length > 0) {
        await parent.runHook('before', parent.getRunArgs())
      }

      await this.runHook('before', hookArgs)

      stop = stopTest(this.timeout, this.signal)
      const subtests = this.skipped || this.error ? [] : this.subtests
      await Promise.race([
        Promise.all(subtests.map((subtest) => subtest.start())),
        stop.promise,
      ])

      await after()

      this.pass()
    } catch (err) {
      try {
        await after()
      } catch {
        // already failing
      }
      this.fail(
        err instanceof TestFailure
          ? err
          : new TestFailure(err, kTestCodeFailure)
      )
    } finally {
      stop?.dispose()
      this.leave()
    }

    this.postRun()
  }
}

/** The suite with an async body that hasn't settled yet. */
/** @type {Suite | null} */
let building = null
/** @type {Array<() => void>} */
const buildQueue = []

/**
 * Run the body of a suite. Without async context tracking only one async body
 * can be in progress or `describe` and `it` calls couldn't find their parent,
 * so any other waits for its turn, its place among its siblings is already set.
 *
 * @param {Suite} suite
 * @returns {Promise<void>}
 */
function scheduleBuild(suite) {
  const { fn } = suite
  const { ctx } = suite.getRunArgs()

  return new Promise((resolve) => {
    const finish = () => {
      suite.buildFinished = true
      resolve(undefined)
    }
    const fail = (/** @type {unknown} */ err) => {
      suite.fail(new TestFailure(err, kTestCodeFailure))
    }

    const job = () => {
      const previous = current

      // Queued before the body runs, so it's ahead of the continuation of the
      // first `await` in the body and behind the sync code after `describe()`.
      queueMicrotask(() => {
        if (building === suite) {
          current = suite
        }
      })

      current = suite
      /** @type {any} */
      let ret
      try {
        ret = fn.call(ctx, ctx)
      } catch (err) {
        fail(err)
      }
      current = previous

      if (typeof ret?.then !== 'function') {
        finish()
        return
      }

      building = suite
      Promise.resolve(ret)
        .catch(fail)
        .then(() => {
          building = null
          if (current === suite) {
            // A suite around this one with a sync body has been built by now.
            current = previous
            while (
              current.parent &&
              (current.buildFinished || current.finished)
            ) {
              current = current.parent
            }
          }
          finish()
          while (building === null && buildQueue.length > 0) {
            buildQueue.shift()?.()
          }
        })
    }

    if (building) {
      buildQueue.push(job)
    } else {
      job()
    }
  })
}

const CTX = { number: 0, skip: false }

/**
 * @param {any} error
 * @returns {Error}
 */
function displayError(error) {
  if (!UNWRAP.has(error.failureType)) {
    return error
  }
  const { cause } = error
  if (cause instanceof Error) {
    return cause
  }
  error.message = typeof cause === 'string' ? cause : formatObj(cause)
  return error
}

/**
 * @param {Test} test
 */
function getFullName(test) {
  let fullName = test.name
  if (test.parent === null) {
    return fullName
  }
  for (let t = test.parent; t.parent !== null; t = t.parent) {
    fullName = `${t.name} > ${fullName}`
  }
  return fullName
}

function newCounters() {
  return {
    /** Number of tests reported before these, by other suites in the queue. */
    offset: 0,
    passes: 0,
    skips: 0,
    todos: 0,
    total: 0,
    /** @type {string[]} */
    errors: [],
  }
}

let counters = newCounters()

const root = new Test({ name: '<root>' })
root.startTime = hrtime()

/** The parent of global `test()` and hook calls. */
/** @type {Test} */
let current = root
let rootFinished = false
/** Index of the next top level test to run */
let next = 0

/**
 * Report an error that doesn't belong to a test
 *
 * @param {Error} err
 */
function rootError(err) {
  counters.errors.push(
    formatError({ ...CTX, name: '<root>', suite: '' }, displayError(err))
  )
}

/**
 * Attribute an uncaught error to the running test, otherwise it would be lost
 * or the test would be reported as passing.
 *
 * @param {unknown} err
 * @param {string} type
 */
function onUncaught(err, type) {
  const failure = new TestFailure(err, type)
  if (current !== root && !current.finished) {
    current.fail(failure)
    current.abortController.abort()
  } else {
    rootError(failure)
  }
}

const onUncaughtException = (/** @type {unknown} */ err) =>
  onUncaught(err, kUncaughtException)
const onUnhandledRejection = (/** @type {unknown} */ err) =>
  onUncaught(err, kUnhandledRejection)
const onErrorEvent = (/** @type {any} */ event) =>
  onUncaught(event.error ?? new Error(event.message), kUncaughtException)
const onRejectionEvent = (/** @type {any} */ event) =>
  onUncaught(event.reason, kUnhandledRejection)

/** Rejects when the event loop is empty, nothing can make a test settle anymore. */
let exiting = deferred()

/**
 * The event loop is empty, so whatever is still pending will never settle. Node.js
 * would hang, but we can tell this is a failure and move on.
 */
function onBeforeExit() {
  const err = new TestFailure(
    'Promise resolution is still pending but the event loop has already resolved',
    kCancelledByParent
  )
  for (const test of root.subtests) {
    if (!test.finished) {
      test.cancel(err)
      test.postRun(err)
    }
  }
  exiting.reject(err)
  exiting = deferred()
  exiting.promise.catch(noop)
}
exiting.promise.catch(noop)

let handlersCount = 0

/**
 * Only active while tests run, any other time uncaught errors keep their default behaviour.
 */
function installHandlers() {
  handlersCount++
  if (handlersCount > 1) {
    return
  }
  if (IS_NODE) {
    process.on('uncaughtException', onUncaughtException)
    process.on('unhandledRejection', onUnhandledRejection)
    process.on('beforeExit', onBeforeExit)
  } else if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('error', onErrorEvent)
    globalThis.addEventListener('unhandledrejection', onRejectionEvent)
  }
}

function uninstallHandlers() {
  handlersCount--
  if (handlersCount > 0) {
    return
  }
  if (IS_NODE) {
    process.removeListener('uncaughtException', onUncaughtException)
    process.removeListener('unhandledRejection', onUnhandledRejection)
    process.removeListener('beforeExit', onBeforeExit)
  } else if (typeof globalThis.removeEventListener === 'function') {
    globalThis.removeEventListener('error', onErrorEvent)
    globalThis.removeEventListener('unhandledrejection', onRejectionEvent)
  }
}

/** @type {Promise<void> | null} */
let draining = null

/**
 * Run the top level tests declared so far, serially.
 */
function drain() {
  draining ??= (async () => {
    installHandlers()
    try {
      do {
        while (next < root.subtests.length) {
          const test = root.subtests[next++]
          if (!test.finished) {
            test.start()
            await test.done.promise
          }
        }
        // Give a chance to whatever is waiting on the last test to declare more
        await new Promise((resolve) => setTimeout(resolve, 0))
      } while (next < root.subtests.length)
    } finally {
      uninstallHandlers()
      draining = null
    }
  })()
  return draining
}

/**
 * The promise of a top level test. `import()` of a test file with a top level
 * `await test()` can't complete before the test does, but tests only start on
 * `exec()` which comes after the import. So when anyone waits for the result
 * start running the top level tests right away.
 *
 * @extends {Promise<void>}
 */
class LazyTestPromise extends Promise {
  static get [Symbol.species]() {
    return Promise
  }

  /**
   * @param {any} [onFulfilled]
   * @param {any} [onRejected]
   */
  // @ts-expect-error same as the base method, but without its overloads
  // biome-ignore lint/suspicious/noThenProperty: it's a promise
  then(onFulfilled, onRejected) {
    drain()
    return super.then(onFulfilled, onRejected)
  }
}

/**
 * @param {Test} test
 */
function queueAtRoot(test) {
  return /** @type {Promise<any>} */ (
    new LazyTestPromise((resolve) => {
      test.done.promise.then(resolve)
    })
  )
}

/**
 * @param {Test} test
 * @param {Test} requestedParent - what it was created on, it isn't the parent of
 * the test if that already finished.
 * @returns {Promise<void>}
 */
function startOrQueue(test, requestedParent) {
  if (test.parent !== root) {
    return test.start()
  }
  // Waiting for a test that runs after the running one would be a deadlock. It
  // is already marked as failed because its parent finished.
  return requestedParent === root ? queueAtRoot(test) : Promise.resolve()
}

/**
 * The taps queue runner
 *
 * @type {import('../taps/types.js').RunnerPartial}
 */
async function runRoot(testCount) {
  counters.offset = testCount
  installHandlers()
  try {
    await drain()

    if (!rootFinished) {
      rootFinished = true
      const args = root.getRunArgs()
      try {
        // Any before hook could still be running if there were no tests
        await Promise.race([
          (async () => {
            await Promise.all(root.hooks.before.map((hook) => hook.promise))
            await root.runHook('after', args)
          })(),
          exiting.promise,
        ])
      } catch (err) {
        root.fail(err)
      }

      for (const message of root.diagnostics) {
        console.log(`${kleur.blue('ℹ')} ${message}`)
      }
      if (root.error !== null) {
        rootError(root.error)
      }
    }
  } finally {
    uninstallHandlers()
  }

  const { errors, passes, skips, total, todos } = counters
  counters = newCounters()
  return [errors, passes, skips, total, todos]
}

TAPS_QUEUE.push(runRoot)

// In a process started by its full path, like `node --test` does, the taps
// entrypoint doesn't auto start and nothing would run with a passing exit code.
if (IS_NODE && process.argv0 !== 'node') {
  setTimeout(start, 0)
}

/**
 * @param {any} Factory
 * @param {any} [name]
 * @param {any} [options]
 * @param {any} [fn]
 * @param {any} [overrides]
 */
function runInContext(Factory, name, options, fn, overrides) {
  const parent = current
  const test = parent.createSubtest(Factory, name, options, fn, overrides)
  return parent instanceof Suite
    ? Promise.resolve()
    : startOrQueue(test, parent)
}

/**
 * @param {any} Factory
 */
function createApi(Factory) {
  /**
   * @param {any} [name]
   * @param {any} [options]
   * @param {any} [fn]
   */
  const api = (name, options, fn) => runInContext(Factory, name, options, fn)
  /**
   * @param {string} keyword
   */
  const shorthand =
    (keyword) =>
    (
      /** @type {any} */ name,
      /** @type {any} */ options,
      /** @type {any} */ fn
    ) =>
      runInContext(Factory, name, options, fn, { [keyword]: true })
  api.skip = shorthand('skip')
  api.todo = shorthand('todo')
  api.only = shorthand('only')
  api.expectFailure = () => unsupported('test.expectFailure()')
  return api
}

/**
 * @param {HookName} name
 */
function createHookApi(name) {
  return (/** @type {any} */ fn, /** @type {any} */ options) => {
    current.createHook(name, fn, options)
  }
}

/** @type {typeof import('node:test').suite} */
export const suite = /** @type {any} */ (createApi(Suite))
/** @type {typeof import('node:test').describe} */
export const describe = suite
/** @type {typeof import('node:test').before} */
export const before = /** @type {any} */ (createHookApi('before'))
/** @type {typeof import('node:test').after} */
export const after = /** @type {any} */ (createHookApi('after'))
/** @type {typeof import('node:test').beforeEach} */
export const beforeEach = /** @type {any} */ (createHookApi('beforeEach'))
/** @type {typeof import('node:test').afterEach} */
export const afterEach = /** @type {any} */ (createHookApi('afterEach'))
/** @type {typeof import('node:test').mock} */
export const mock = /** @type {any} */ (new MockTracker())

/**
 * Not implemented, always throws.
 *
 * @type {typeof import('node:test').run}
 */
export const run = () => unsupported('run()')

/**
 * Not implemented, all its methods throw.
 *
 * @type {typeof import('node:test').snapshot}
 */
export const snapshot = {
  setDefaultSnapshotSerializers: () =>
    unsupported('snapshot.setDefaultSnapshotSerializers()'),
  setResolveSnapshotPath: () =>
    unsupported('snapshot.setResolveSnapshotPath()'),
}

/** @type {typeof import('node:test').assert} */
export const assert = {
  register(name, fn) {
    registeredAssertions.set(name, fn)
  },
}

/**
 * The context of the running test, if there's one.
 */
export function getTestContext() {
  return current === root ? undefined : current.getCtx()
}

/** @type {typeof import('node:test').test} */
export const test = /** @type {any} */ (
  Object.assign(createApi(Test), {
    after,
    afterEach,
    assert,
    before,
    beforeEach,
    describe,
    getTestContext,
    mock,
    run,
    snapshot,
    suite,
  })
)
test.test = test
test.it = test

/** @type {typeof import('node:test').it} */
export const it = test

export { exec, hold }

export default test
