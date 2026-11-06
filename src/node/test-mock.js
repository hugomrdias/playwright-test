/**
 * Mocks for the `node:test` compatible API, see `test.js`.
 *
 * Mirrors `MockTracker` from Node.js without any Node.js only dependency.
 */
import { isDeepStrictEqual } from 'util'
import { AssertionError } from './assert.js'

/**
 * Throw for a `node:test` feature that isn't implemented, it must never silently do nothing.
 *
 * @param {string} feature
 * @returns {never}
 */
export function unsupported(feature) {
  throw new Error(
    `node:test ${feature} is not supported by playwright-test/node-test`
  )
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

/**
 * @param {unknown} value
 */
function isObject(value) {
  return value !== null && typeof value === 'object'
}

/**
 * @param {unknown} value
 * @param {string} name
 */
function validateFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`The "${name}" argument must be of type function.`)
  }
}

/**
 * @param {number} value
 */
function validateTimes(value) {
  if (
    value !== Number.POSITIVE_INFINITY &&
    !(Number.isInteger(value) && value >= 1)
  ) {
    throw new RangeError(
      'The value of "options.times" must be an integer >= 1.'
    )
  }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {string} name
 */
function validateIndex(value, min, name) {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`The value of "${name}" must be an integer >= ${min}.`)
  }
}

class MockFunctionContext {
  /** @type {any[]} */
  #calls = []
  /** @type {Map<number, Function>} */
  #mocks = new Map()
  #implementation
  #restore
  #times

  /**
   * @param {Function} implementation
   * @param {any} restore
   * @param {number} times
   */
  constructor(implementation, restore, times) {
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

  /**
   * @param {Function} implementation
   */
  mockImplementation(implementation) {
    validateFunction(implementation, 'implementation')
    this.#implementation = implementation
  }

  /**
   * @param {Function} implementation
   * @param {number} [onCall]
   */
  mockImplementationOnce(implementation, onCall) {
    validateFunction(implementation, 'implementation')
    const nextCall = this.#calls.length
    const call = onCall ?? nextCall
    validateIndex(call, nextCall, 'onCall')
    this.#mocks.set(call, implementation)
  }

  restore() {
    const { descriptor, object, original, methodName } = this.#restore

    if (methodName === undefined) {
      // A bare function, all that can be done is calling the original.
      this.#implementation = original
    } else {
      Object.defineProperty(object, methodName, descriptor)
    }
  }

  resetCalls() {
    this.#calls = []
  }

  /**
   * @param {any} call
   */
  trackCall(call) {
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
  #object
  #propertyName
  #descriptor
  #originalValue
  /** @type {any} */
  #value
  /** @type {any[]} */
  #accesses = []
  /** @type {Map<number, any>} */
  #onceValues = new Map()

  /**
   * @param {any} object
   * @param {PropertyKey} propertyName
   * @param {any[]} value
   */
  constructor(object, propertyName, ...value) {
    this.#object = object
    this.#propertyName = propertyName
    this.#originalValue = object[propertyName]
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

  /**
   * @param {any} value
   */
  mockImplementation(value) {
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

  /**
   * @param {any} value
   */
  #getAccessValue(value) {
    const accessIndex = this.#accesses.length
    if (this.#onceValues.has(accessIndex)) {
      const accessValue = this.#onceValues.get(accessIndex)
      this.#onceValues.delete(accessIndex)
      return accessValue
    }
    return value
  }

  /**
   * @param {any} value
   * @param {number} [onAccess]
   */
  mockImplementationOnce(value, onAccess) {
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
  /** @type {Array<MockFunctionContext | MockPropertyContext>} */
  #mocks = []

  get timers() {
    return unsupported('mock.timers')
  }

  /**
   * @param {string} _specifier
   * @param {object} [_options]
   * @returns {never}
   */
  module(_specifier, _options) {
    return unsupported('mock.module()')
  }

  /**
   * @param {any} [original]
   * @param {any} [implementation]
   * @param {any} [options]
   */
  fn(original = emptyFunction(), implementation = original, options = {}) {
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
    const { times = Number.POSITIVE_INFINITY } = options
    validateTimes(times)
    const ctx = new MockFunctionContext(implementation, { original }, times)
    return this.#setupMock(ctx, original)
  }

  /**
   * @param {any} objectOrFunction
   * @param {string | symbol} methodName
   * @param {any} [implementation]
   * @param {any} [options]
   */
  method(
    objectOrFunction,
    methodName,
    implementation = defaultFunction,
    options = {}
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
    } = options
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

    if (typeof original !== 'function') {
      throw new TypeError(`"${String(methodName)}" must be a method`)
    }

    const ctx = new MockFunctionContext(
      implementation === defaultFunction ? original : implementation,
      { descriptor, object: objectOrFunction, methodName },
      times
    )
    const mock = this.#setupMock(ctx, original)
    /** @type {PropertyDescriptor} */
    const mockDescriptor = {
      configurable: descriptor?.configurable,
      enumerable: descriptor?.enumerable,
    }

    if (getter) {
      mockDescriptor.get = mock
      mockDescriptor.set = descriptor?.set
    } else if (setter) {
      mockDescriptor.get = descriptor?.get
      mockDescriptor.set = mock
    } else {
      mockDescriptor.writable = descriptor?.writable
      mockDescriptor.value = mock
    }

    Object.defineProperty(objectOrFunction, methodName, mockDescriptor)

    return mock
  }

  /**
   * @param {any} object
   * @param {string | symbol} methodName
   * @param {any} [implementation]
   * @param {any} [options]
   */
  getter(object, methodName, implementation = defaultFunction, options = {}) {
    if (isObject(implementation)) {
      options = implementation
      implementation = defaultFunction
    }
    if (options.getter === false) {
      throw new TypeError("The option 'options.getter' cannot be false")
    }
    return this.method(object, methodName, implementation, {
      ...options,
      getter: true,
    })
  }

  /**
   * @param {any} object
   * @param {string | symbol} methodName
   * @param {any} [implementation]
   * @param {any} [options]
   */
  setter(object, methodName, implementation = defaultFunction, options = {}) {
    if (isObject(implementation)) {
      options = implementation
      implementation = defaultFunction
    }
    if (options.setter === false) {
      throw new TypeError("The option 'options.setter' cannot be false")
    }
    return this.method(object, methodName, implementation, {
      ...options,
      setter: true,
    })
  }

  /**
   * @param {any} object
   * @param {string | symbol} propertyName
   * @param {any[]} value
   */
  property(object, propertyName, ...value) {
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
    this.#mocks = []
  }

  restoreAll() {
    for (const ctx of this.#mocks) {
      ctx.restore()
    }
  }

  /**
   * @param {MockFunctionContext} ctx
   * @param {any} fnToMatch
   */
  #setupMock(ctx, fnToMatch) {
    /**
     * @param {any} target
     * @param {any} thisArg
     * @param {any[]} args
     * @param {(fn: any) => any} call
     * @param {boolean} isConstruct
     */
    const track = (target, thisArg, args, call, isConstruct) => {
      const fn = nextImpl.call(ctx)
      let result
      let error

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
        )
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

/**
 * @param {any} instance
 * @param {string | symbol} methodName
 */
function findDescriptor(instance, methodName) {
  let host = instance
  while (host !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(host, methodName)
    if (descriptor) {
      return descriptor
    }
    host = Object.getPrototypeOf(host)
  }
}

/**
 * @param {any} fn
 * @returns {MockFunctionContext}
 */
function getMockContext(fn) {
  const ctx = fn?.mock
  if (!(ctx instanceof MockFunctionContext)) {
    const error = new TypeError('The "fn" argument must be mock function.')
    Object.assign(error, { code: 'ERR_INVALID_ARG_TYPE' })
    throw error
  }
  return ctx
}

/**
 * @param {unknown} value
 * @param {string} name
 * @param {number} min
 */
function validateInteger(value, name, min) {
  if (!Number.isInteger(value) || /** @type {number} */ (value) < min) {
    throw new RangeError(`The value of "${name}" must be an integer >= ${min}.`)
  }
}

/**
 * @param {any} fn
 * @param {number} n
 * @param {unknown[]} args
 * @param {Function} stackStartFn
 */
function assertCalledWithAt(fn, n, args, stackStartFn) {
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

/**
 * @param {any} fn
 * @param {string} [message]
 */
function called(fn, message) {
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

/**
 * @param {any} fn
 * @param {number} times
 * @param {string} [message]
 */
function callCount(fn, times, message) {
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

/**
 * @param {any} fn
 * @param {number} n
 * @param {unknown[]} args
 */
function nthCalledWith(fn, n, ...args) {
  validateInteger(n, 'n', 1)
  assertCalledWithAt(fn, n, args, nthCalledWith)
}

/**
 * @param {any} fn
 * @param {unknown[]} args
 */
function lastCalledWith(fn, ...args) {
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
