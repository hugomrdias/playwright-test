// @ts-nocheck
// Generated from Node.js v26.13.1 `lib/internal/test_runner/mock/mock_timers.js` and
// `lib/internal/priority_queue.js`, with only the changes needed to run in browsers.
// Copyright Node.js contributors, MIT license.
//
// Browsers have no `node:timers` or `node:timers/promises`, so only the globals are
// mocked: `setTimeout`, `setInterval`, `setImmediate` (added when the browser has
// none), `Date` and `AbortSignal.timeout`. `scheduler.wait` comes from
// `node:timers/promises`, asking for it throws.
import { primordials } from './node-primordials.js';
import { codes } from './node-errors.js';

const {
  ArrayIsArray,
  ArrayPrototypeForEach,
  ArrayPrototypeIncludes,
  DatePrototypeGetTime,
  DatePrototypeToString,
  FunctionPrototypeBind,
  FunctionPrototypeToString,
  NumberIsInteger,
  NumberIsNaN,
  ObjectDefineProperties,
  ObjectDefineProperty,
  ObjectGetOwnPropertyDescriptor,
  ObjectGetOwnPropertyDescriptors,
  ObjectSetPrototypeOf,
  ReflectApply,
  Symbol,
  globalThis,
} = primordials;

const SymbolDispose = Symbol.dispose ?? Symbol.for('nodejs.dispose');

const { ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE, ERR_OUT_OF_RANGE } = codes;

class ERR_INVALID_STATE extends Error {
  code = 'ERR_INVALID_STATE';

  constructor(message) {
    super(`Invalid state: ${message}`);
  }
}

function validateNumber(value, name) {
  if (typeof value !== 'number') {
    throw new ERR_INVALID_ARG_TYPE(name, 'number', value);
  }
}

function validateUint32(value, name, positive = false) {
  if (typeof value !== 'number') {
    throw new ERR_INVALID_ARG_TYPE(name, 'number', value);
  }
  if (!NumberIsInteger(value)) {
    throw new ERR_OUT_OF_RANGE(name, 'an integer', value);
  }
  const min = positive ? 1 : 0;
  // 2 ** 32 === 4294967296
  const max = 4_294_967_295;
  if (value < min || value > max) {
    throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value);
  }
}

function validateStringArray(value, name) {
  if (!ArrayIsArray(value)) {
    throw new ERR_INVALID_ARG_TYPE(name, 'Array', value);
  }
  for (let i = 0; i < value.length; ++i) {
    if (typeof value[i] !== 'string') {
      throw new ERR_INVALID_ARG_TYPE(`${name}[${i}]`, 'string', value[i]);
    }
  }
}

const TIMEOUT_MAX = 2 ** 31 - 1;

// The PriorityQueue is a basic implementation of a binary heap that accepts
// a custom sorting function via its constructor. This function is passed
// the two nodes to compare, similar to the native Array#sort. Crucially
// this enables priority queues that are based on a comparison of more than
// just a single criteria.
class PriorityQueue {
  #compare = (a, b) => a - b;
  #heap = [undefined, undefined];
  #setPosition;
  #size = 0;

  constructor(comparator, setPosition) {
    if (comparator !== undefined)
      this.#compare = comparator;
    if (setPosition !== undefined)
      this.#setPosition = setPosition;
  }

  insert(value) {
    const heap = this.#heap;
    const pos = ++this.#size;
    heap[pos] = value;

    this.percolateUp(pos);
  }

  peek() {
    return this.#heap[1];
  }

  peekBottom() {
    return this.#heap[this.#size];
  }

  percolateDown(pos) {
    const compare = this.#compare;
    const setPosition = this.#setPosition;
    const hasSetPosition = setPosition !== undefined;
    const heap = this.#heap;
    const size = this.#size;
    const hsize = size >> 1;
    const item = heap[pos];

    while (pos <= hsize) {
      let child = pos << 1;
      const nextChild = child + 1;
      let childItem = heap[child];

      if (nextChild <= size && compare(heap[nextChild], childItem) < 0) {
        child = nextChild;
        childItem = heap[nextChild];
      }

      if (compare(item, childItem) <= 0) break;

      if (hasSetPosition)
        setPosition(childItem, pos);

      heap[pos] = childItem;
      pos = child;
    }

    heap[pos] = item;
    if (hasSetPosition)
      setPosition(item, pos);
  }

  percolateUp(pos) {
    const heap = this.#heap;
    const compare = this.#compare;
    const setPosition = this.#setPosition;
    const hasSetPosition = setPosition !== undefined;
    const item = heap[pos];

    while (pos > 1) {
      const parent = pos >> 1;
      const parentItem = heap[parent];
      if (compare(parentItem, item) <= 0)
        break;
      heap[pos] = parentItem;
      if (hasSetPosition)
        setPosition(parentItem, pos);
      pos = parent;
    }

    heap[pos] = item;
    if (hasSetPosition)
      setPosition(item, pos);
  }

  removeAt(pos) {
    const heap = this.#heap;
    let size = this.#size;
    heap[pos] = heap[size];
    heap[size] = undefined;
    size = --this.#size;

    if (size > 0 && pos <= size) {
      if (pos > 1 && this.#compare(heap[pos >> 1], heap[pos]) > 0)
        this.percolateUp(pos);
      else
        this.percolateDown(pos);
    }
  }

  shift() {
    const heap = this.#heap;
    const value = heap[1];
    if (value === undefined)
      return;

    this.removeAt(1);

    return value;
  }
}

// Internal reference to the MockTimers class inside MockDate
let kMock;
// Initial epoch to which #now should be set to
const kInitialEpoch = 0;

function compareTimersLists(a, b) {
  return (a.runAt - b.runAt) || (a.id - b.id);
}

function setPosition(node, pos) {
  node.priorityQueuePosition = pos;
}

/**
 * @typedef {('setTimeout'|'setInterval'|'setImmediate'|'Date'|'scheduler.wait'|'AbortSignal.timeout')[]} SupportedApis
 * Supported timers that can be enabled via MockTimers.enable({ apis: [...] })
 */
const SUPPORTED_APIS = [
  'setTimeout',
  'setInterval',
  'setImmediate',
  'Date',
  'scheduler.wait',
  'AbortSignal.timeout',
];
// What `enable()` mocks without `apis`, there's no `scheduler.wait` in browsers
const DEFAULT_APIS = [
  'setTimeout',
  'setInterval',
  'setImmediate',
  'Date',
  'AbortSignal.timeout',
];
const TIMERS_DEFAULT_INTERVAL = {
  __proto__: null,
  setImmediate: -1,
};

class Timeout {
  #clear;

  constructor(opts) {
    this.id = opts.id;
    this.callback = opts.callback;
    this.runAt = opts.runAt;
    this.interval = opts.interval;
    this.args = opts.args;
    this.#clear = opts.clear;
  }

  hasRef() {
    return true;
  }

  ref() {
    return this;
  }

  unref() {
    return this;
  }

  refresh() {
    return this;
  }

  close() {
    this.#clear(this);
    return this;
  }

  [SymbolDispose]() {
    this.#clear(this);
  }
}

/** Put back a global as it was, or remove it when there was none, like `setImmediate` in browsers. */
function restoreGlobal(name, descriptor) {
  if (descriptor === undefined) {
    delete globalThis[name];
  } else {
    ObjectDefineProperty(globalThis, name, descriptor);
  }
}

export class MockTimers {
  #realSetTimeout;
  #realClearTimeout;
  #realSetInterval;
  #realClearInterval;
  #realSetImmediate;
  #realClearImmediate;

  #nativeDateDescriptor;
  #realAbortSignalTimeout;

  #timersInContext = [];
  #isEnabled = false;
  #currentTimer = 1;
  #now = kInitialEpoch;

  #executionQueue = new PriorityQueue(compareTimersLists, setPosition);

  #setTimeout = FunctionPrototypeBind(this.#createTimer, this, false);
  #clearTimeout = FunctionPrototypeBind(this.#clearTimer, this);
  #setInterval = FunctionPrototypeBind(this.#createTimer, this, true);
  #clearInterval = FunctionPrototypeBind(this.#clearTimer, this);
  #clearImmediate = FunctionPrototypeBind(this.#clearTimer, this);

  #restoreSetImmediate() {
    restoreGlobal('setImmediate', this.#realSetImmediate);
    restoreGlobal('clearImmediate', this.#realClearImmediate);
  }

  #restoreOriginalSetInterval() {
    restoreGlobal('setInterval', this.#realSetInterval);
    restoreGlobal('clearInterval', this.#realClearInterval);
  }

  #restoreOriginalSetTimeout() {
    restoreGlobal('setTimeout', this.#realSetTimeout);
    restoreGlobal('clearTimeout', this.#realClearTimeout);
  }

  #storeOriginalSetImmediate() {
    this.#realSetImmediate = ObjectGetOwnPropertyDescriptor(
      globalThis,
      'setImmediate',
    );
    this.#realClearImmediate = ObjectGetOwnPropertyDescriptor(
      globalThis,
      'clearImmediate',
    );
  }

  #storeOriginalSetInterval() {
    this.#realSetInterval = ObjectGetOwnPropertyDescriptor(
      globalThis,
      'setInterval',
    );
    this.#realClearInterval = ObjectGetOwnPropertyDescriptor(
      globalThis,
      'clearInterval',
    );
  }

  #storeOriginalSetTimeout() {
    this.#realSetTimeout = ObjectGetOwnPropertyDescriptor(
      globalThis,
      'setTimeout',
    );
    this.#realClearTimeout = ObjectGetOwnPropertyDescriptor(
      globalThis,
      'clearTimeout',
    );
  }

  #storeOriginalAbortSignalTimeout() {
    this.#realAbortSignalTimeout = ObjectGetOwnPropertyDescriptor(AbortSignal, 'timeout');
  }

  #restoreOriginalAbortSignalTimeout() {
    if (this.#realAbortSignalTimeout === undefined) {
      delete AbortSignal.timeout;
    } else {
      ObjectDefineProperty(AbortSignal, 'timeout', ObjectSetPrototypeOf(this.#realAbortSignalTimeout, null));
    }
  }

  #createTimer(isInterval, callback, delay, ...args) {
    if (delay > TIMEOUT_MAX) {
      delay = 1;
    }

    const timerId = this.#currentTimer++;
    const opts = {
      __proto__: null,
      id: timerId,
      callback,
      runAt: this.#now + delay,
      interval: isInterval ? delay : undefined,
      args,
      clear: this.#clearTimeout,
    };

    const timer = new Timeout(opts);
    this.#executionQueue.insert(timer);
    return timer;
  }

  #clearTimer(timer) {
    if (timer?.priorityQueuePosition !== undefined) {
      this.#executionQueue.removeAt(timer.priorityQueuePosition);
      timer.priorityQueuePosition = undefined;
      timer.interval = undefined;
    }
  }

  #createDate() {
    kMock ??= Symbol('MockTimers');
    const NativeDateConstructor = this.#nativeDateDescriptor.value;
    if (NativeDateConstructor.isMock) {
      throw new ERR_INVALID_STATE('Date is already being mocked!');
    }
    /**
     * Function to mock the Date constructor, treats cases as per ECMA-262
     * and returns a Date object with a mocked implementation
     * @typedef {Date} MockDate
     * @returns {MockDate} a mocked Date object
     */
    function MockDate(year, month, date, hours, minutes, seconds, ms) {
      const mockTimersSource = MockDate[kMock];
      const nativeDate = mockTimersSource.#nativeDateDescriptor.value;

      // As of the fake-timers implementation for Sinon
      // ref https://github.com/sinonjs/fake-timers/blob/a4c757f80840829e45e0852ea1b17d87a998388e/src/fake-timers-src.js#L456
      // This covers the Date constructor called as a function ref.
      // ECMA-262 Edition 5.1 section 15.9.2.
      // and ECMA-262 Edition 14 Section 21.4.2.1
      // replaces 'this instanceof MockDate' with a more reliable check
      // from ECMA-262 Edition 14 Section 13.3.12.1 NewTarget
      if (!new.target) {
        return DatePrototypeToString(new nativeDate(mockTimersSource.#now));
      }

      // Cases where Date is called as a constructor
      // This is intended as a defensive implementation to avoid
      // having unexpected returns
      switch (arguments.length) {
        case 0:
          return new nativeDate(MockDate[kMock].#now);
        case 1:
          return new nativeDate(year);
        case 2:
          return new nativeDate(year, month);
        case 3:
          return new nativeDate(year, month, date);
        case 4:
          return new nativeDate(year, month, date, hours);
        case 5:
          return new nativeDate(year, month, date, hours, minutes);
        case 6:
          return new nativeDate(year, month, date, hours, minutes, seconds);
        default:
          return new nativeDate(year, month, date, hours, minutes, seconds, ms);
      }
    }

    // Prototype is read-only, and non assignable through Object.defineProperties
    // eslint-disable-next-line no-unused-vars -- used to get the prototype out of the object
    const { prototype, ...dateProps } = ObjectGetOwnPropertyDescriptors(NativeDateConstructor);

    // Binds all the properties of Date to the MockDate function
    ObjectDefineProperties(
      MockDate,
      dateProps,
    );

    MockDate.now = function now() {
      return MockDate[kMock].#now;
    };

    // This is just to print the function { native code } in the console
    // when the user prints the function and not the internal code
    MockDate.toString = function toString() {
      return FunctionPrototypeToString(MockDate[kMock].#nativeDateDescriptor.value);
    };

    // We need to pollute the prototype of this
    ObjectDefineProperties(MockDate, {
      __proto__: null,
      [kMock]: {
        __proto__: null,
        enumerable: false,
        configurable: false,
        writable: false,
        value: this,
      },

      isMock: {
        __proto__: null,
        enumerable: true,
        configurable: false,
        writable: false,
        value: true,
      },
    });

    MockDate.prototype = NativeDateConstructor.prototype;
    MockDate.parse = NativeDateConstructor.parse;
    MockDate.UTC = NativeDateConstructor.UTC;
    MockDate.prototype.toUTCString = NativeDateConstructor.prototype.toUTCString;
    return MockDate;
  }

  #setImmediate(callback, ...args) {
    return this.#createTimer(
      false,
      callback,
      TIMERS_DEFAULT_INTERVAL.setImmediate,
      ...args,
    );
  }

  #assertTimersAreEnabled() {
    if (!this.#isEnabled) {
      throw new ERR_INVALID_STATE(
        'You should enable MockTimers first by calling the .enable function',
      );
    }
  }

  #assertTimeArg(time) {
    if (time < 0) {
      throw new ERR_INVALID_ARG_VALUE('time', 'positive integer', time);
    }
  }

  #isValidDateWithGetTime(maybeDate) {
    // Validation inspired on https://github.com/inspect-js/is-date-object/blob/main/index.js#L3-L11
    try {
      DatePrototypeGetTime(maybeDate);
      return true;
    } catch {
      return false;
    }
  }

  #toggleEnableTimers(activate) {
    const options = {
      __proto__: null,
      toFake: {
        '__proto__': null,
        'setTimeout': () => {
          this.#storeOriginalSetTimeout();

          globalThis.setTimeout = this.#setTimeout;
          globalThis.clearTimeout = this.#clearTimeout;
        },
        'setInterval': () => {
          this.#storeOriginalSetInterval();

          globalThis.setInterval = this.#setInterval;
          globalThis.clearInterval = this.#clearInterval;
        },
        'setImmediate': () => {
          this.#storeOriginalSetImmediate();

          // setImmediate functions needs to bind MockTimers
          // otherwise it will throw an error when called
          // "Receiver must be an instance of MockTimers"
          // because #setImmediate is the only function here
          // that calls #createTimer and it's not bound to MockTimers
          globalThis.setImmediate = FunctionPrototypeBind(
            this.#setImmediate,
            this,
          );
          globalThis.clearImmediate = this.#clearImmediate;
        },
        'Date': () => {
          this.#nativeDateDescriptor = ObjectSetPrototypeOf(ObjectGetOwnPropertyDescriptor(globalThis, 'Date'), null);
          globalThis.Date = this.#createDate();
        },
        'AbortSignal.timeout': () => {
          this.#storeOriginalAbortSignalTimeout();
          const mock = this;
          ObjectDefineProperty(AbortSignal, 'timeout', {
            __proto__: null,
            configurable: true,
            writable: true,
            value: function timeout(delay) {
              validateUint32(delay, 'delay', false);
              const controller = new AbortController();
              // Don't keep an unused binding to the timer; mock tick controls it
              mock.#setTimeout(
                () => {
                  controller.abort();
                },
                delay,
              );
              return controller.signal;
            },
          });
        },
      },
      toReal: {
        '__proto__': null,
        'setTimeout': () => {
          this.#restoreOriginalSetTimeout();
        },
        'setInterval': () => {
          this.#restoreOriginalSetInterval();
        },
        'setImmediate': () => {
          this.#restoreSetImmediate();
        },
        'Date': () => {
          ObjectDefineProperty(globalThis, 'Date', this.#nativeDateDescriptor);
        },
        'AbortSignal.timeout': () => {
          this.#restoreOriginalAbortSignalTimeout();
        },
      },
    };

    const target = activate ? options.toFake : options.toReal;
    ArrayPrototypeForEach(this.#timersInContext, (timer) => target[timer]());
    this.#isEnabled = activate;
  }

  /**
   * Advances the virtual time of MockTimers by the specified duration (in milliseconds).
   * This method simulates the passage of time and triggers any scheduled timers that are due.
   * @param {number} [time] - The amount of time (in milliseconds) to advance the virtual time.
   * @throws {ERR_INVALID_STATE} If MockTimers are not enabled.
   * @throws {ERR_INVALID_ARG_VALUE} If a negative time value is provided.
   */
  tick(time = 1) {
    this.#assertTimersAreEnabled();
    this.#assertTimeArg(time);

    this.#now += time;
    let timer = this.#executionQueue.peek();
    while (timer) {
      if (timer.runAt > this.#now) break;
      ReflectApply(timer.callback, undefined, timer.args);

      // Check if the timeout was cleared by calling clearTimeout inside its own callback
      const afterCallback = this.#executionQueue.peek();
      if (afterCallback?.id === timer.id) {
        this.#executionQueue.shift();
        timer.priorityQueuePosition = undefined;
      }

      if (timer.interval !== undefined) {
        timer.runAt += timer.interval;
        this.#executionQueue.insert(timer);
      }

      timer = this.#executionQueue.peek();
    }
  }

  /**
   * @typedef {{apis: SupportedApis;now: number | Date;}} EnableOptions Options to enable the timers
   * @property {SupportedApis} apis List of timers to enable, defaults to all
   * @property {number | Date} now The epoch to which the timers should be set to, defaults to 0
   */

  /**
   * Enables the MockTimers replacing the native timers with the fake ones.
   * @param {EnableOptions} [options]
   */
  enable(options = { __proto__: null, apis: DEFAULT_APIS, now: 0 }) {
    const internalOptions = { __proto__: null, ...options };
    if (this.#isEnabled) {
      throw new ERR_INVALID_STATE('MockTimers is already enabled!');
    }

    if (NumberIsNaN(internalOptions.now)) {
      throw new ERR_INVALID_ARG_VALUE('now', internalOptions.now, `epoch must be a positive integer received ${internalOptions.now}`);
    }

    internalOptions.now ||= 0;

    internalOptions.apis ||= DEFAULT_APIS;

    // Check that the timers passed are supported
    validateStringArray(internalOptions.apis, 'options.apis');
    ArrayPrototypeForEach(internalOptions.apis, (timer) => {
      if (!ArrayPrototypeIncludes(SUPPORTED_APIS, timer)) {
        throw new ERR_INVALID_ARG_VALUE(
          'options.apis',
          timer,
          `option ${timer} is not supported`,
        );
      }
      if (timer === 'scheduler.wait') {
        throw new Error(
          'node:test mock.timers scheduler.wait is not supported by playwright-test/node-test',
        );
      }
    });
    this.#timersInContext = internalOptions.apis;

    // Checks if the second argument is the initial time
    if (this.#isValidDateWithGetTime(internalOptions.now)) {
      this.#now = DatePrototypeGetTime(internalOptions.now);
    } else if (validateNumber(internalOptions.now, 'initialTime') === undefined) {
      this.#assertTimeArg(internalOptions.now);
      this.#now = internalOptions.now;
    }

    this.#toggleEnableTimers(true);
  }

  /**
   * Sets the current time to the given epoch.
   * @param {number} time The epoch to set the current time to.
   */
  setTime(time = kInitialEpoch) {
    validateNumber(time, 'time');
    this.#assertTimeArg(time);
    this.#assertTimersAreEnabled();

    this.#now = time;
  }

  /**
   * An alias for `this.reset()`, allowing the disposal of the `MockTimers` instance.
   */
  [SymbolDispose]() {
    this.reset();
  }

  /**
   * Resets MockTimers, disabling any enabled timers and clearing the execution queue.
   * Does nothing if MockTimers are not enabled.
   */
  reset() {
    // Ignore if not enabled
    if (!this.#isEnabled) return;

    this.#toggleEnableTimers(false);
    this.#timersInContext = [];
    this.#now = kInitialEpoch;

    let timer = this.#executionQueue.peek();
    while (timer) {
      this.#executionQueue.shift();
      timer = this.#executionQueue.peek();
    }
  }

  /**
   * Runs all scheduled timers until there are no more pending timers.
   * @throws {ERR_INVALID_STATE} If MockTimers are not enabled.
   */
  runAll() {
    this.#assertTimersAreEnabled();
    const longestTimer = this.#executionQueue.peekBottom();
    if (!longestTimer) return;
    this.tick(longestTimer.runAt - this.#now);
  }
}
