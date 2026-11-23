/**
 * Mocks for the `node:test` compatible API, see `test.js`.
 *
 * Mirrors `MockTracker` from Node.js without any Node.js only dependency.
 */
import { isDeepStrictEqual } from 'util'
import { MockTimers } from '../vendor/node-mock-timers.js'
import { AssertionError } from './assert.ts'

/**
 * Throw for a `node:test` feature that isn't implemented, it must never silently do nothing.
 */
export function unsupported(feature: string): never {
  throw new Error(
    `node:test ${feature} is not supported by playwright-test/node-test`
  )
}

/** What a mock stands in for: a function, a method, an accessor or a class */
type Implementation = (this: unknown, ...args: unknown[]) => unknown

/** The options of `mock.fn()`, `mock.method()`, `mock.getter()` and `mock.setter()` */
interface MockOptions {
  times?: number
  getter?: boolean
  setter?: boolean
}

interface MockCall {
  arguments: unknown[]
  error: unknown
  result: unknown
  stack: Error
  target: unknown
  this: unknown
}

interface MockAccess {
  type: 'get' | 'set'
  value: unknown
  stack: Error
}

/** How to undo a mock: back to the original function, or to the original property */
type Restore =
  | { original: Implementation }
  | {
      descriptor: PropertyDescriptor
      object: object
      methodName: string | symbol
    }

const defaultFunction = () => {
  // noop
}

/**
 * A new function each time, not an arrow function so the mock works with `new`.
 */
function emptyFunction() {
  // biome-ignore lint/complexity/useArrowFunction: has to be a constructor
  return function () {
    // noop
  }
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

function validateFunction(
  value: unknown,
  name: string
): asserts value is Implementation {
  if (typeof value !== 'function') {
    throw new TypeError(`The "${name}" argument must be of type function.`)
  }
}

function validateTimes(value: number) {
  if (
    value !== Number.POSITIVE_INFINITY &&
    !(Number.isInteger(value) && value >= 1)
  ) {
    throw new RangeError(
      'The value of "options.times" must be an integer >= 1.'
    )
  }
}

function validateIndex(value: number, min: number, name: string) {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`The value of "${name}" must be an integer >= ${min}.`)
  }
}

class MockFunctionContext {
  #calls: MockCall[] = []
  #mocks: Map<number, Implementation> = new Map()
  #implementation: Implementation
  #restore: Restore
  #times: number

  constructor(implementation: Implementation, restore: Restore, times: number) {
    this.#implementation = implementation
    this.#restore = restore
    this.#times = times
  }

  get calls() {
    return [...this.#calls]
  }

  callCount() {
    return this.#calls.length
  }

  mockImplementation(implementation: unknown) {
    validateFunction(implementation, 'implementation')
    this.#implementation = implementation
  }

  mockImplementationOnce(implementation: unknown, onCall?: number) {
    validateFunction(implementation, 'implementation')
    const nextCall = this.#calls.length
    const call = onCall ?? nextCall
    validateIndex(call, nextCall, 'onCall')
    this.#mocks.set(call, implementation)
  }

  restore() {
    const restore = this.#restore

    if ('original' in restore) {
      // A bare function, all that can be done is calling the original.
      this.#implementation = restore.original
    } else {
      Object.defineProperty(
        restore.object,
        restore.methodName,
        restore.descriptor
      )
    }
  }

  resetCalls() {
    this.#calls = []
  }

  trackCall(call: MockCall) {
    this.#calls.push(call)
  }

  nextImpl() {
    const nextCall = this.#calls.length
    const impl = this.#mocks.get(nextCall) ?? this.#implementation

    if (nextCall + 1 === this.#times) {
      this.restore()
    }

    this.#mocks.delete(nextCall)
    return impl
  }
}

// Internal to the tracker, Node.js doesn't expose them to users either.
const { nextImpl, trackCall } = MockFunctionContext.prototype
// @ts-expect-error private to this module
delete MockFunctionContext.prototype.trackCall
// @ts-expect-error private to this module
delete MockFunctionContext.prototype.nextImpl

class MockPropertyContext {
  #object: object
  #propertyName: PropertyKey
  #descriptor: PropertyDescriptor
  #originalValue: unknown
  #value: unknown
  #accesses: MockAccess[] = []
  #onceValues: Map<number, unknown> = new Map()

  constructor(object: object, propertyName: PropertyKey, ...value: unknown[]) {
    this.#object = object
    this.#propertyName = propertyName
    this.#originalValue = (object as Record<PropertyKey, unknown>)[propertyName]
    this.#value = value.length > 0 ? value[0] : this.#originalValue
    const descriptor = Object.getOwnPropertyDescriptor(object, propertyName)
    if (!descriptor) {
      throw new TypeError(
        `The property "${String(propertyName)}" is not a property of the object`
      )
    }
    this.#descriptor = descriptor

    const { configurable, enumerable } = descriptor
    Object.defineProperty(object, propertyName, {
      configurable,
      enumerable,
      get: () => {
        const nextValue = this.#getAccessValue(this.#value)
        this.#accesses.push({
          type: 'get',
          value: nextValue,
          stack: new Error('mock access'),
        })
        return nextValue
      },
      set: this.mockImplementation.bind(this),
    })
  }

  get accesses() {
    return [...this.#accesses]
  }

  accessCount() {
    return this.#accesses.length
  }

  mockImplementation(value: unknown) {
    if (!this.#descriptor.writable) {
      throw new TypeError(
        `The property "${String(this.#propertyName)}" cannot be set`
      )
    }
    const nextValue = this.#getAccessValue(value)
    this.#accesses.push({
      type: 'set',
      value: nextValue,
      stack: new Error('mock access'),
    })
    this.#value = nextValue
  }

  #getAccessValue(value: unknown) {
    const accessIndex = this.#accesses.length
    if (this.#onceValues.has(accessIndex)) {
      const accessValue = this.#onceValues.get(accessIndex)
      this.#onceValues.delete(accessIndex)
      return accessValue
    }
    return value
  }

  mockImplementationOnce(value: unknown, onAccess?: number) {
    const nextAccess = this.#accesses.length
    const accessIndex = onAccess ?? nextAccess
    validateIndex(accessIndex, nextAccess, 'onAccess')
    this.#onceValues.set(accessIndex, value)
  }

  resetAccesses() {
    this.#accesses = []
  }

  restore() {
    Object.defineProperty(this.#object, this.#propertyName, {
      ...this.#descriptor,
      value: this.#originalValue,
    })
  }
}

export class MockTracker {
  #mocks: (MockFunctionContext | MockPropertyContext)[] = []
  #timers: MockTimers | undefined

  get timers() {
    this.#timers ??= new MockTimers()
    return this.#timers
  }

  module(_specifier: string, _options?: object): never {
    return unsupported('mock.module()')
  }

  fn(
    original: unknown = emptyFunction(),
    implementation: unknown = original,
    options: unknown = {}
  ) {
    if (isObject(original)) {
      options = original
      original = emptyFunction()
      implementation = original
    } else if (isObject(implementation)) {
      options = implementation
      implementation = original
    }

    validateFunction(original, 'original')
    validateFunction(implementation, 'implementation')
    const { times = Number.POSITIVE_INFINITY } = options as MockOptions
    validateTimes(times)
    const ctx = new MockFunctionContext(implementation, { original }, times)
    return this.#setupMock(ctx, original)
  }

  method(
    objectOrFunction: unknown,
    methodName: string | symbol,
    implementation: unknown = defaultFunction,
    options: unknown = {}
  ) {
    if (typeof methodName !== 'string' && typeof methodName !== 'symbol') {
      throw new TypeError(
        'The "methodName" argument must be a string or a symbol.'
      )
    }
    if (typeof objectOrFunction !== 'function' && !isObject(objectOrFunction)) {
      throw new TypeError('The "object" argument must be an object.')
    }

    if (isObject(implementation)) {
      options = implementation
      implementation = defaultFunction
    }

    validateFunction(implementation, 'implementation')
    const {
      getter = false,
      setter = false,
      times = Number.POSITIVE_INFINITY,
    } = options as MockOptions
    validateTimes(times)

    if (setter && getter) {
      throw new TypeError(
        "The option 'options.setter' cannot be used with 'options.getter'"
      )
    }

    const descriptor = findDescriptor(objectOrFunction, methodName)
    const original = getter
      ? descriptor?.get
      : setter
        ? descriptor?.set
        : descriptor?.value

    // Without a descriptor there's no original either
    if (!descriptor || typeof original !== 'function') {
      throw new TypeError(`"${String(methodName)}" must be a method`)
    }

    const ctx = new MockFunctionContext(
      implementation === defaultFunction ? original : implementation,
      { descriptor, object: objectOrFunction, methodName },
      times
    )
    const mock = this.#setupMock(ctx, original)
    const mockDescriptor: PropertyDescriptor = {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
    }

    if (getter) {
      mockDescriptor.get = mock
      mockDescriptor.set = descriptor.set
    } else if (setter) {
      mockDescriptor.get = descriptor.get
      mockDescriptor.set = mock
    } else {
      mockDescriptor.writable = descriptor.writable
      mockDescriptor.value = mock
    }

    Object.defineProperty(objectOrFunction, methodName, mockDescriptor)

    return mock
  }

  getter(
    object: unknown,
    methodName: string | symbol,
    implementation: unknown = defaultFunction,
    options: unknown = {}
  ) {
    if (isObject(implementation)) {
      options = implementation
      implementation = defaultFunction
    }
    if ((options as MockOptions).getter === false) {
      throw new TypeError("The option 'options.getter' cannot be false")
    }
    return this.method(object, methodName, implementation, {
      ...(options as MockOptions),
      getter: true,
    })
  }

  setter(
    object: unknown,
    methodName: string | symbol,
    implementation: unknown = defaultFunction,
    options: unknown = {}
  ) {
    if (isObject(implementation)) {
      options = implementation
      implementation = defaultFunction
    }
    if ((options as MockOptions).setter === false) {
      throw new TypeError("The option 'options.setter' cannot be false")
    }
    return this.method(object, methodName, implementation, {
      ...(options as MockOptions),
      setter: true,
    })
  }

  property(
    object: unknown,
    propertyName: string | symbol,
    ...value: unknown[]
  ) {
    if (typeof propertyName !== 'string' && typeof propertyName !== 'symbol') {
      throw new TypeError(
        'The "propertyName" argument must be a string or a symbol.'
      )
    }
    if (!isObject(object) && typeof object !== 'function') {
      throw new TypeError('The "object" argument must be an object.')
    }

    const ctx = new MockPropertyContext(object, propertyName, ...value)
    this.#mocks.push(ctx)

    return new Proxy(object, {
      get(target, property, receiver) {
        return property === 'mock'
          ? ctx
          : Reflect.get(target, property, receiver)
      },
    })
  }

  reset() {
    this.restoreAll()
    this.#timers?.reset()
    this.#mocks = []
  }

  restoreAll() {
    for (const ctx of this.#mocks) {
      ctx.restore()
    }
  }

  #setupMock(ctx: MockFunctionContext, fnToMatch: Implementation) {
    const track = (
      target: Implementation,
      thisArg: unknown,
      args: unknown[],
      call: (fn: Implementation) => unknown,
      isConstruct: boolean
    ) => {
      const fn = nextImpl.call(ctx)
      let result: unknown
      let error: unknown

      try {
        result = call(fn)
      } catch (err) {
        error = err
        throw err
      } finally {
        trackCall.call(ctx, {
          arguments: args,
          error,
          result,
          stack: new Error('mock call'),
          target: isConstruct ? target : undefined,
          this: isConstruct ? result : thisArg,
        })
      }

      return result
    }
    const mock = new Proxy(fnToMatch, {
      apply(target, thisArg, args) {
        return track(
          target,
          thisArg,
          args,
          (fn) => Reflect.apply(fn, thisArg, args),
          false
        )
      },
      construct(target, args, newTarget) {
        return track(
          target,
          undefined,
          args,
          (fn) => Reflect.construct(fn, args, newTarget),
          true
        ) as object
      },
      get(target, property, receiver) {
        return property === 'mock'
          ? ctx
          : Reflect.get(target, property, receiver)
      },
    })

    this.#mocks.push(ctx)
    return mock
  }
}

function findDescriptor(instance: object, methodName: string | symbol) {
  let host: object | null = instance
  while (host !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(host, methodName)
    if (descriptor) {
      return descriptor
    }
    host = Object.getPrototypeOf(host)
  }
}

function getMockContext(fn: unknown): MockFunctionContext {
  const ctx = (fn as { mock?: unknown } | null | undefined)?.mock
  if (!(ctx instanceof MockFunctionContext)) {
    const error = new TypeError('The "fn" argument must be mock function.')
    Object.assign(error, { code: 'ERR_INVALID_ARG_TYPE' })
    throw error
  }
  return ctx
}

function validateInteger(value: unknown, name: string, min: number) {
  if (!Number.isInteger(value) || (value as number) < min) {
    throw new RangeError(`The value of "${name}" must be an integer >= ${min}.`)
  }
}

function assertCalledWithAt(
  fn: unknown,
  n: number,
  args: unknown[],
  stackStartFn: (...args: never[]) => void
) {
  const { calls } = getMockContext(fn)

  if (n > calls.length) {
    throw new AssertionError({
      message: `Expected mock function to have been called at least ${n} times, but it was called ${calls.length} times`,
      actual: calls.length,
      expected: n,
      operator: stackStartFn.name,
      stackStartFn,
    })
  }

  const actual = calls[n - 1].arguments
  if (!isDeepStrictEqual(actual, args)) {
    throw new AssertionError({
      message: `Expected call ${n} of mock function to have been called with:`,
      actual,
      expected: args,
      operator: 'deepStrictEqual',
      stackStartFn,
    })
  }
}

function called(fn: unknown, message?: string) {
  const count = getMockContext(fn).callCount()
  if (count === 0) {
    throw new AssertionError({
      message: message ?? 'Expected mock function to have been called',
      actual: count,
      operator: 'called',
      stackStartFn: called,
    })
  }
}

function callCount(fn: unknown, times: number, message?: string) {
  validateInteger(times, 'times', 0)
  const count = getMockContext(fn).callCount()
  if (count !== times) {
    throw new AssertionError({
      message:
        message ??
        `Expected mock function to have been called ${times} times, but it was called ${count} times`,
      actual: count,
      expected: times,
      operator: 'callCount',
      stackStartFn: callCount,
    })
  }
}

function nthCalledWith(fn: unknown, n: number, ...args: unknown[]) {
  validateInteger(n, 'n', 1)
  assertCalledWithAt(fn, n, args, nthCalledWith)
}

function lastCalledWith(fn: unknown, ...args: unknown[]) {
  const count = getMockContext(fn).callCount()
  if (count === 0) {
    throw new AssertionError({
      message: 'Expected mock function to have been called',
      actual: count,
      operator: 'lastCalledWith',
      stackStartFn: lastCalledWith,
    })
  }
  assertCalledWithAt(fn, count, args, lastCalledWith)
}

/**
 * The assertions about mocks in `t.assert`, in `node:test` since Node.js 26.
 */
export const mockAssertions = {
  called,
  callCount,
  lastCalledWith,
  nthCalledWith,
}
