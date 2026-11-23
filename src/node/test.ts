/** biome-ignore-all lint/suspicious/noConsole: its ok */
/**
 * `node:test` compatible API that runs in browsers and in Node.js. It only
 * exports what `node:test` does, runners use `./test-harness.ts` to drive it.
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

import type { TestContext as NodeTestContext } from 'node:test'
import { inspect } from 'util'
import { RUNNING_TEST_KEY } from '../utils/running-test.ts'
import { legacy as nodeAssert } from './assert.ts'
import {
  config,
  formatDiagnostic,
  formatFailure,
  formatTest,
  hrtime,
  IS_ENV_WITH_DOM,
  IS_NODE,
  indent,
  matchesNamePattern,
  registerRun,
  start,
} from './test-harness.ts'
import { MockTracker, mockAssertions, unsupported } from './test-mock.ts'

/** Any function, what can't be called without knowing it */
type AnyFunction = (...args: never[]) => unknown

/** A test, a suite or a hook, the callback is only there when it takes 2 arguments */
type TestFn = (
  this: TestContext | SuiteContext,
  ctx: TestContext | SuiteContext,
  done?: (err?: unknown) => void
) => unknown

type HookType = 'before' | 'after' | 'beforeEach' | 'afterEach'

interface HookOptions {
  timeout?: number | null
  signal?: AbortSignal
}

/** What a test or a suite is created with, the API and its parent */
interface TestOptions {
  fn?: unknown
  name?: unknown
  parent?: Test | null
  concurrency?: unknown
  expectFailure?: unknown
  only?: boolean
  plan?: number
  signal?: AbortSignal
  skip?: boolean | string
  tags?: unknown
  timeout?: number | null
  todo?: boolean | string
}

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

const TIMEOUT_MAX = 2 ** 31 - 1

const noop = () => {
  // noop
}

class TestFailure extends Error {
  declare failureType: string

  code = 'ERR_TEST_FAILURE'

  constructor(error: unknown, failureType: string) {
    super(
      (error as { message?: string } | null | undefined)?.message ??
        String(error)
    )
    this.failureType = failureType
    this.cause = error
  }
}

function deferred() {
  let resolve: () => void = noop
  let reject: (reason?: unknown) => void = noop
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Run an async function once, and keep returning its promise.
 */
function runOnce(fn: () => Promise<void>) {
  let promise: Promise<void> | undefined
  return () => {
    promise ??= fn()
    return promise
  }
}

/**
 * A promise that resolves when the signal aborts or, with a timeout, rejects
 * when either of them happen.
 */
function stopTest(timeout: number | null, signal: AbortSignal) {
  const { promise, resolve } = deferred()
  const onAbort = () => resolve()
  let timer: ReturnType<typeof setTimeout> | undefined

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
 */
function invoke(
  fn: TestFn,
  ctx: TestContext | SuiteContext,
  fail: (err: TestFailure) => void
) {
  if (fn.length !== 2) {
    return Promise.resolve(fn.call(ctx, ctx))
  }

  // Error-first callback style `(t, done) => {}`
  const { promise, resolve, reject } = deferred()
  let calledCount = 0
  const ret = fn.call(ctx, ctx, (err?: unknown) => {
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

  if (
    typeof (ret as PromiseLike<unknown> | null | undefined)?.then === 'function'
  ) {
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

/** Tags take part in the expressions of `--experimental-test-tag-filter`. */
// Only ASCII whitespace, like Node.js
const FORBIDDEN_TAG = /[\t\n\v\f\r &|!()*]/
const RESERVED_TAGS = new Set(['and', 'or', 'not'])

function invalidArg(code: string, message: string) {
  return Object.assign(new TypeError(message), { code })
}

/** What `node:test` says it received, in the messages of `ERR_INVALID_ARG_TYPE`. */
function describeReceived(value: unknown) {
  if (value == null) {
    return String(value)
  }
  if (typeof value === 'function') {
    return value.name ? `function ${value.name}` : 'function'
  }
  if (typeof value === 'object') {
    const name = (value as { constructor?: { name?: string } }).constructor
      ?.name
    return name ? `an instance of ${name}` : inspect(value, { depth: -1 })
  }
  let shown = value
  if (typeof shown === 'string' && shown.length > 28) {
    shown = `${shown.slice(0, 25)}...`
  }
  return `type ${typeof value} (${inspect(shown, { colors: false })})`
}

/**
 * Validate the `tags` option, and normalize it like `node:test`: lowercase,
 * without duplicates, the first time a tag shows up is where it stays.
 */
function normalizeTags(tags: unknown, inherited: readonly string[] = []) {
  if (tags !== undefined && !Array.isArray(tags)) {
    throw invalidArg(
      'ERR_INVALID_ARG_TYPE',
      `The "options.tags" property must be an instance of Array. Received ${describeReceived(tags)}`
    )
  }
  const result = new Set(inherited)
  const list = (tags ?? []) as unknown[]
  // By index, holes are `undefined` and the array can have its own `entries`
  for (let i = 0; i < list.length; i++) {
    const tag = list[i]
    const name = `options.tags[${i}]`
    if (typeof tag !== 'string') {
      throw invalidArg(
        'ERR_INVALID_ARG_TYPE',
        `The "${name}" property must be of type string. Received ${describeReceived(tag)}`
      )
    }
    let inspected = inspect(tag, { colors: false })
    if (inspected.length > 128) {
      inspected = `${inspected.slice(0, 128)}...`
    }
    const received = `Received ${inspected}`
    if (tag === '') {
      throw invalidArg(
        'ERR_INVALID_ARG_VALUE',
        `The property '${name}' must not be empty. ${received}`
      )
    }
    if (FORBIDDEN_TAG.test(tag)) {
      throw invalidArg(
        'ERR_INVALID_ARG_VALUE',
        `The property '${name}' contains a forbidden character. Tags must not contain whitespace, operator characters (&, |, !, (, ), *), or be the reserved words 'and', 'or', or 'not'. ${received}`
      )
    }
    const lowercase = tag.toLowerCase()
    if (RESERVED_TAGS.has(lowercase)) {
      throw invalidArg(
        'ERR_INVALID_ARG_VALUE',
        `The property '${name}' must not be the reserved word 'and', 'or', or 'not'. ${received}`
      )
    }
    result.add(lowercase)
  }
  // Frozen like in Node.js, the tags of the children are made from them
  return Object.freeze([...result])
}

function validateTimeout(
  timeout: unknown,
  name: string
): asserts timeout is number {
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
  wait: number | boolean | undefined
  expected: number
  actual: number

  #waitIndefinitely = false
  #planPromise: ReturnType<typeof deferred> | null = null
  #timeoutId: ReturnType<typeof setTimeout> | undefined = undefined

  constructor(count: number, options: { wait?: boolean | number } = {}) {
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
      this.#timeoutId = setTimeout(() => {
        planPromise.reject(
          new TestFailure(
            `plan timed out after ${this.wait}ms with ${this.actual} assertions when expecting ${this.expected}`,
            kTestTimeoutFailure
          )
        )
      }, this.wait as number)
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
] as const satisfies (keyof typeof nodeAssert)[]

const registeredAssertions: Map<string, AnyFunction> = new Map()

class TestContext {
  #assert: Record<string, (...args: unknown[]) => unknown> | undefined
  #test: Test

  constructor(test: Test) {
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

  diagnostic(message: string) {
    this.#test.diagnostics.push(String(message))
  }

  log(message: string, data?: unknown) {
    console.log(...(data === undefined ? [message] : [message, data]))
  }

  plan(count: number, options?: { wait?: boolean | number }) {
    if (this.#test.plan !== null) {
      throw new TestFailure('cannot set plan more than once', kTestCodeFailure)
    }
    this.#test.plan = new TestPlan(count, options)
  }

  get assert() {
    if (this.#assert === undefined) {
      const test = this.#test
      const assert: Record<string, (...args: unknown[]) => unknown> =
        Object.create(null)
      const add = (name: string, method: AnyFunction) => {
        assert[name] = (...args: unknown[]) => {
          test.plan?.count()
          return Reflect.apply(method, this, args)
        }
      }

      for (const name of ASSERT_METHODS) {
        add(name, nodeAssert[name])
      }
      for (const [name, method] of Object.entries(mockAssertions)) {
        add(name, method)
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

  runOnly(value: boolean) {
    this.#test.runOnlySubtests = !!value
  }

  skip(message?: string) {
    this.#test.skipped = true
    this.#test.message = message
  }

  todo(message?: string) {
    this.#test.isTodo = true
    this.#test.message = message
  }

  test(name?: unknown, options?: unknown, fn?: unknown) {
    this.#test.plan?.count()
    const subtest = this.#test.createSubtest(Test, name, options, fn)
    return startOrQueue(subtest, this.#test)
  }

  before(fn: unknown, options?: HookOptions) {
    this.#test.createHook('before', fn, options)
  }

  after(fn: unknown, options?: HookOptions) {
    this.#test.createHook('after', fn, options)
  }

  beforeEach(fn: unknown, options?: HookOptions) {
    this.#test.createHook('beforeEach', fn, options)
  }

  afterEach(fn: unknown, options?: HookOptions) {
    this.#test.createHook('afterEach', fn, options)
  }

  waitFor<T>(
    condition: () => T | Promise<T>,
    options: { interval?: number; timeout?: number } = {}
  ): Promise<T> {
    if (typeof condition !== 'function') {
      throw new TypeError('The "condition" argument must be of type function.')
    }
    const { interval = 50, timeout = 1000 } = options
    validateTimeout(interval, 'options.interval')
    validateTimeout(timeout, 'options.timeout')

    return new Promise((resolve, reject) => {
      let cause: unknown
      let failed = false
      let pollerId: ReturnType<typeof setTimeout> | undefined
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
  #suite: Test

  constructor(suite: Test) {
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

  diagnostic(message: string) {
    this.#suite.diagnostics.push(String(message))
  }

  log(message: string, data?: unknown) {
    console.log(...(data === undefined ? [message] : [message, data]))
  }
}

class TestHook {
  hookType: HookType
  fn: TestFn
  timeout: number | null
  outerSignal: AbortSignal | undefined

  error: TestFailure | Error | null = null
  promise: Promise<void> | undefined

  constructor(
    hookType: HookType,
    fn: unknown,
    { timeout, signal }: HookOptions = {}
  ) {
    if (timeout != null && timeout !== Number.POSITIVE_INFINITY) {
      validateTimeout(timeout, 'options.timeout')
    }
    this.hookType = hookType
    this.fn = typeof fn === 'function' ? (fn as TestFn) : noop
    this.timeout =
      timeout === Number.POSITIVE_INFINITY
        ? null
        : (timeout ?? (config.timeout || null))
    this.outerSignal = signal
  }

  run(args: { ctx: TestContext | SuiteContext }) {
    if (this.hookType === 'before' || this.hookType === 'after') {
      this.promise ??= this.#run(args)
      return this.promise
    }
    return this.#run(args)
  }

  async #run({ ctx }: { ctx: TestContext | SuiteContext }) {
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
        (err as { failureType?: unknown } | null | undefined)?.failureType ===
          kAborted
          ? (err as Error)
          : new TestFailure(err, kTestCodeFailure)
    } finally {
      stop.dispose()
    }
  }
}

function abortError(signal: AbortSignal | undefined) {
  const reason = signal?.reason
  const error =
    reason !== null && typeof reason === 'object'
      ? reason
      : new DOMException('The test was aborted', 'AbortError')
  error.failureType = kAborted
  return error
}

class Test {
  name: string
  parent: Test | null
  /** Where it shows in the output, the tests at the top are `0`. */
  nesting: number
  only: boolean | undefined
  timeout: number | null
  tags: readonly string[]
  abortController: AbortController
  outerSignal: AbortSignal | undefined
  signal: AbortSignal
  fn: TestFn
  expectedAssertions: number | undefined
  skipped: boolean
  isTodo: boolean

  reportedType: 'test' | 'suite' = 'test'
  mock: MockTracker | null = null
  plan: TestPlan | null = null
  #ctx: TestContext | undefined
  message: string | undefined | null = null
  cancelled = false
  filtered = false
  finished = false
  hasOnlyTests = false
  passed = false
  runOnlySubtests = false
  /** Whether it was shown as the parent of what's inside of it. */
  announced = false
  /** The build of a suite, tests never have one. */
  buildFinished = false
  active = false
  error: unknown = null
  startTime: (() => number) | null = null
  diagnostics: string[] = []
  subtests: Test[] = []
  pendingSubtests: { test: Test; resolve: () => void }[] = []
  unfinishedSubtests: Set<Test> = new Set()
  subtestsPromise: ReturnType<typeof deferred> | null = null
  previous: Test | null = null
  errorsAtStart = 0
  done = deferred()
  hooks = {
    before: [] as TestHook[],
    after: [] as TestHook[],
    beforeEach: [] as TestHook[],
    afterEach: [] as TestHook[],
    ownAfterEachCount: 0,
  }

  constructor(options: TestOptions) {
    const { name, parent, concurrency, expectFailure, only, plan } = options
    const { signal, skip, tags, timeout, todo } = options
    let fn = options.fn as TestFn

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
    this.parent = parent ?? null
    this.nesting = parent ? parent.nesting + 1 : -1
    this.only = only
    this.timeout = parent?.timeout ?? null
    this.tags = normalizeTags(tags, parent?.tags)

    if (only && parent) {
      // If filtering impacts the tests within a suite, then the suite only runs
      // those tests. If it does not, then all tests are run.
      parent.runOnlySubtests = true

      if (parent === root || parent.startTime === null) {
        for (
          let t: Test | null = parent;
          t !== null && !t.hasOnlyTests;
          t = t.parent
        ) {
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
    } else if (timeout == null && config.timeout) {
      // Like `node:test`, `--test-timeout` wins over the parent's timeout
      this.timeout = config.timeout
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
    if (this.error) {
      return
    }
    if (this.isFilteredByName()) {
      this.filtered = true
      return
    }
    if (this.only || this.hasOnlyTests) {
      return
    }
    const parent = this.parent as Test
    if (
      parent.runOnlySubtests ||
      parent.hasOnlyTests ||
      (root.hasOnlyTests && this.only === false)
    ) {
      this.filtered = true
    }
  }

  isFilteredByName() {
    return !matchesName(this)
  }

  createSubtest(
    Factory: typeof Test,
    name?: unknown,
    options?: unknown,
    fn?: unknown,
    overrides?: TestOptions
  ): Test {
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
        `Test "${typeof name === 'string' ? name : '<anonymous>'}" was created after the tests finished running. Declare tests before the run ends, or await them when using top-level await.`
      )
    }

    const test = new Factory({
      fn,
      name,
      ...(options as TestOptions),
      ...overrides,
      parent,
    })

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

  cancel(error?: unknown) {
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
    const { beforeEach, afterEach } = (this.parent as Test).hooks
    this.hooks.beforeEach.unshift(...beforeEach)
    this.hooks.afterEach.push(...afterEach)
  }

  createHook(name: HookType, fn: unknown, options?: HookOptions) {
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

  fail(err: unknown) {
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

  start(): Promise<void> {
    this.applyFilters()
    const parent = this.parent as Test

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

  addUnfinished(subtest: Test) {
    if (this.unfinishedSubtests.size === 0) {
      this.subtestsPromise = deferred()
    }
    this.unfinishedSubtests.add(subtest)
  }

  async processPendingSubtests() {
    while (this.pendingSubtests.length > 0 && !this.active) {
      const next = this.pendingSubtests.shift() as {
        test: Test
        resolve: () => void
      }
      await next.test.run()
      next.resolve()
    }
  }

  getCtx() {
    this.#ctx ??= new TestContext(this)
    return this.#ctx
  }

  getRunArgs(): { ctx: TestContext | SuiteContext } {
    return { ctx: this.getCtx() }
  }

  async runHook(
    name: 'before' | 'after' | 'beforeEach' | 'afterEach',
    args: { ctx: TestContext | SuiteContext }
  ) {
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
    const parent = this.parent as Test
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
    const ctx = hookArgs.ctx as TestContext

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

    let stop: ReturnType<typeof stopTest> | undefined

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
          (this.subtestsPromise as ReturnType<typeof deferred>).promise,
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

  postRun(pendingSubtestsError?: unknown) {
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

    const parent = this.parent as Test
    if (!this.filtered) {
      try {
        this.report()
      } catch (err) {
        // The next tests wait for this one, and a run with no report would pass
        rootError(err)
      }
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

  /**
   * Parents are only shown once there's something inside of them to show.
   */
  announceParents() {
    const parents = []
    for (let t = this.parent; t && t !== root && !t.announced; t = t.parent) {
      parents.unshift(t)
    }
    for (const parent of parents) {
      parent.announced = true
      console.log(`${indent(parent.nesting)}▶ ${parent.name}`)
    }
  }

  count() {
    if (this.reportedType === 'suite') {
      counters.suites++
      return
    }
    if (this.skipped) {
      counters.skips++
    } else if (this.isTodo) {
      counters.todos++
    } else if (this.cancelled) {
      counters.cancelled++
    } else if (this.passed) {
      counters.passes++
    } else {
      counters.failures++
    }
    counters.total++
  }

  report() {
    const result = {
      name: this.name,
      passed: this.passed,
      skip: this.skipped,
      todo: this.isTodo,
      message: this.message,
      time: this.startTime?.() ?? 0,
    }

    this.count()
    // A failing todo doesn't fail the run, so it's not a failure to show
    const failed = !this.passed && !this.skipped && !this.isTodo
    if (!config.minimal || failed) {
      this.announceParents()
      console.log(formatTest(result, this.nesting))
      for (const message of this.diagnostics) {
        console.log(formatDiagnostic(this.nesting, message))
      }
    }

    if (
      this.error === null ||
      (config.minimal && !failed) ||
      // What failed in the subtests is already there
      ((this.error as { failureType?: unknown } | undefined)?.failureType ===
        kSubtestsFailed &&
        counters.errors.length !== this.errorsAtStart)
    ) {
      return
    }
    // A test counts by itself, this is a failure of the hooks of a suite
    if (this.reportedType === 'suite' && !this.skipped && !this.isTodo) {
      counters.failures++
    }
    counters.errors.push(formatFailure(result, this.error))
  }
}

class Suite extends Test {
  declare buildPromise: Promise<void>

  reportedType: 'test' | 'suite' = 'suite'

  constructor(options: TestOptions) {
    super(options)
    if (options.timeout == null) {
      this.timeout = null
    }
    this.buildPromise = scheduleBuild(this)
  }

  getRunArgs(): { ctx: TestContext | SuiteContext } {
    return { ctx: new SuiteContext(this) }
  }

  async filteredRun() {
    await this.buildPromise
    return super.filteredRun()
  }

  /** What's in the suite is only known once it's built, see {@link run}. */
  isFilteredByName() {
    return false
  }

  async run() {
    const parent = this.parent as Test
    this.computeInheritedHooks()
    const hookArgs = this.getRunArgs()
    this.errorsAtStart = counters.errors.length

    const after = runOnce(() => this.runHook('after', hookArgs))
    let stop: ReturnType<typeof stopTest> | undefined
    try {
      parent.active = true
      await this.buildPromise
      if (
        config.namePattern !== null &&
        !this.error &&
        !(await hasNameMatch(this))
      ) {
        this.filtered = true
        parent.active = false
        return this.filteredRun()
      }
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
let building: Suite | null = null
const buildQueue: Array<() => void> = []

/**
 * Run the body of a suite. Without async context tracking only one async body
 * can be in progress or `describe` and `it` calls couldn't find their parent,
 * so any other waits for its turn, its place among its siblings is already set.
 */
function scheduleBuild(suite: Suite): Promise<void> {
  const { fn } = suite
  const { ctx } = suite.getRunArgs()

  return new Promise((resolve) => {
    const finish = () => {
      suite.buildFinished = true
      resolve(undefined)
    }
    const fail = (err: unknown) => {
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
      let ret: unknown
      try {
        ret = fn.call(ctx, ctx)
      } catch (err) {
        fail(err)
      }
      current = previous

      if (
        typeof (ret as PromiseLike<unknown> | null | undefined)?.then !==
        'function'
      ) {
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

function getFullName(test: Test) {
  let fullName = test.name
  if (test.parent === null) {
    return fullName
  }
  for (let t = test.parent; t.parent !== null; t = t.parent) {
    fullName = `${t.name} > ${fullName}`
  }
  return fullName
}

function matchesName(test: Test) {
  const names = []
  for (let t = test; t.parent !== null; t = t.parent) {
    names.push(t.name)
  }
  return matchesNamePattern(names)
}

/**
 * Whether a test matches or, for a suite, anything inside of it does.
 */
async function hasNameMatch(test: Test): Promise<boolean> {
  if (matchesName(test)) {
    return true
  }
  if (test instanceof Suite) {
    await test.buildPromise
    for (const subtest of test.subtests) {
      if (await hasNameMatch(subtest)) {
        return true
      }
    }
  }
  return false
}

function newCounters() {
  return {
    cancelled: 0,
    duration: 0,
    failures: 0,
    passes: 0,
    suites: 0,
    skips: 0,
    todos: 0,
    total: 0,
    errors: [] as string[],
  }
}

let counters = newCounters()

const root = new Test({ name: '<root>' })
root.startTime = hrtime()

/** The parent of global `test()` and hook calls. */
let current: Test = root
let rootFinished = false
/** Index of the next top level test to run */
let next = 0

/**
 * Report an error that doesn't belong to a test
 */
function rootError(err: unknown) {
  counters.failures++
  counters.errors.push(formatFailure({ name: '<root>', passed: false }, err))
}

/**
 * Attribute an uncaught error to the running test, otherwise it would be lost
 * or the test would be reported as passing.
 */
function onUncaught(err: unknown, type: string) {
  const failure = new TestFailure(err, type)
  if (current !== root && !current.finished) {
    current.fail(failure)
    current.abortController.abort()
  } else {
    rootError(failure)
  }
}

const onUncaughtException = (err: unknown) =>
  onUncaught(err, kUncaughtException)
const onUnhandledRejection = (err: unknown) =>
  onUncaught(err, kUnhandledRejection)
const onErrorEvent = (event: ErrorEvent) =>
  onUncaught(event.error ?? new Error(event.message), kUncaughtException)
const onRejectionEvent = (event: PromiseRejectionEvent) =>
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

let draining: Promise<void> | null = null

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
class LazyTestPromise extends Promise<void> {
  static get [Symbol.species]() {
    return Promise
  }

  // biome-ignore lint/suspicious/noThenProperty: it's a promise
  then<R1 = void, R2 = never>(
    // biome-ignore lint/suspicious/noConfusingVoidType: the same as Promise<void>
    onFulfilled?: ((value: void) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    drain()
    return super.then(onFulfilled, onRejected)
  }
}

function queueAtRoot(test: Test) {
  return new LazyTestPromise((resolve) => {
    test.done.promise.then(resolve)
  }) as Promise<void>
}

/**
 * @param requestedParent - what it was created on, it isn't the parent of
 * the test if that already finished.
 */
function startOrQueue(test: Test, requestedParent: Test): Promise<void> {
  if (test.parent !== root) {
    return test.start()
  }
  // Waiting for a test that runs after the running one would be a deadlock. It
  // is already marked as failed because its parent finished.
  return requestedParent === root ? queueAtRoot(test) : Promise.resolve()
}

/**
 * Run everything declared so far, and what it did.
 */
async function runRoot() {
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

      if (!config.minimal || root.error !== null) {
        for (const message of root.diagnostics) {
          console.log(formatDiagnostic(0, message))
        }
      }
      if (root.error !== null) {
        rootError(root.error)
      }
    }
  } finally {
    uninstallHandlers()
  }

  const result = counters
  result.duration = (root.startTime as () => number)()
  counters = newCounters()
  return result
}

registerRun(runRoot)

// For the runner to name the test that was running when --run-timeout ends the run
Object.defineProperty(globalThis, Symbol.for(RUNNING_TEST_KEY), {
  configurable: true,
  value: () => (current === root ? undefined : getFullName(current)),
})

// Without a runner, that's `node file.js`, `node --test` or the `none` runner.
// Runners call `hold()` before they load the test files.
if (IS_NODE) {
  setTimeout(start, 0)
} else if (IS_ENV_WITH_DOM) {
  window.addEventListener('load', start)
}

function runInContext(
  Factory: typeof Test,
  name?: unknown,
  options?: unknown,
  fn?: unknown,
  overrides?: TestOptions
) {
  const parent = current
  const test = parent.createSubtest(Factory, name, options, fn, overrides)
  return parent instanceof Suite
    ? Promise.resolve()
    : startOrQueue(test, parent)
}

function createApi(Factory: typeof Test) {
  const api = (name?: unknown, options?: unknown, fn?: unknown) =>
    runInContext(Factory, name, options, fn)
  const shorthand =
    (keyword: 'skip' | 'todo' | 'only') =>
    (name?: unknown, options?: unknown, fn?: unknown) =>
      runInContext(Factory, name, options, fn, { [keyword]: true })
  api.skip = shorthand('skip')
  api.todo = shorthand('todo')
  api.only = shorthand('only')
  api.expectFailure = () => unsupported('test.expectFailure()')
  return api
}

function createHookApi(name: HookType) {
  return (fn: unknown, options?: HookOptions) => {
    current.createHook(name, fn, options)
  }
}

export const suite: typeof import('node:test').suite = createApi(Suite)
export const describe: typeof import('node:test').describe = suite
export const before: typeof import('node:test').before = createHookApi('before')
export const after: typeof import('node:test').after = createHookApi('after')
export const beforeEach: typeof import('node:test').beforeEach =
  createHookApi('beforeEach')
export const afterEach: typeof import('node:test').afterEach =
  createHookApi('afterEach')
// Everything of `node:test` that browsers can do, see `unsupported` for the rest
export const mock =
  new MockTracker() as unknown as typeof import('node:test').mock

/**
 * Not implemented, always throws.
 */
export const run: typeof import('node:test').run = () => unsupported('run()')

/**
 * Not implemented, all its methods throw.
 */
export const snapshot: typeof import('node:test').snapshot = {
  setDefaultSnapshotSerializers: () =>
    unsupported('snapshot.setDefaultSnapshotSerializers()'),
  setResolveSnapshotPath: () =>
    unsupported('snapshot.setResolveSnapshotPath()'),
}

export const assert: typeof import('node:test').assert = {
  register(name, fn) {
    registeredAssertions.set(name, fn)
  },
}

/**
 * The context of the running test, if there's one.
 */
export function getTestContext(): NodeTestContext | undefined {
  // The context of `node:test`, without what only Node.js has
  return current === root
    ? undefined
    : (current.getCtx() as unknown as NodeTestContext)
}

const testApi = createApi(Test)

// `test.test` and `test.it` come right after, `MockPropertyContext` is only a type
export const test = Object.assign(testApi, {
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
}) as unknown as typeof import('node:test').test
test.test = test
test.it = test

export const it: typeof import('node:test').it = test

export const skip: typeof import('node:test').skip = test.skip

export const todo: typeof import('node:test').todo = test.todo

export const only: typeof import('node:test').only = test.only

/**
 * Not implemented, always throws.
 */
export const expectFailure = testApi.expectFailure

export default test
