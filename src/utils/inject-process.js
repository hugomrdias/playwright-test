// @ts-nocheck
const noop = () => undefined

// Kept from before tests can stub it with fake timers
const startTimer = globalThis.setTimeout

/** @type {Array<() => void>} */
const ticks = []
let nextTickIndex = 0
let ticksScheduled = false

/**
 * Runs ticks added along the way too, and leaves the rest for another timer
 * when one throws. It walks the queue with an index because `shift()` makes long
 * queues quadratic.
 */
function drainTicks() {
  try {
    while (nextTickIndex < ticks.length) {
      const tick = ticks[nextTickIndex]
      nextTickIndex += 1
      tick()
    }
  } finally {
    ticksScheduled = nextTickIndex < ticks.length
    if (ticksScheduled) {
      startTimer(drainTicks, 0)
    } else {
      ticks.length = 0
      nextTickIndex = 0
    }
  }
}

const performance = globalThis.performance || {}
const performanceNow = performance.now || (() => Date.now())

// generate timestamp or delta
// see http://nodejs.org/api/process.html#process_process_hrtime
/**
 *
 * @param {number} previousTimestamp
 */
function hrtime(previousTimestamp) {
  const clocktime = performanceNow.call(performance) * 1e-3
  let seconds = Math.floor(clocktime)
  let nanoseconds = Math.floor((clocktime % 1) * 1e9)
  if (previousTimestamp) {
    seconds = seconds - previousTimestamp[0]
    nanoseconds = nanoseconds - previousTimestamp[1]
    if (nanoseconds < 0) {
      seconds--
      nanoseconds += 1e9
    }
  }
  return [seconds, nanoseconds]
}

const p = {
  title: 'browser',
  browser: true,
  env: {},
  argv: [],
  version: '', // empty string to avoid regexp issues
  versions: {},
  on: noop,
  addListener: noop,
  once: noop,
  off: noop,
  removeListener: noop,
  removeAllListeners: noop,
  emit: noop,
  prependListener: noop,
  prependOnceListener: noop,
  listeners: () => [],
  binding: () => {
    throw new Error('process.binding is not supported')
  },
  cwd: () => '/',
  chdir: () => {
    throw new Error('process.chdir is not supported')
  },
  umask: () => 0,
  // A timer and not a microtask: code that defers its start with this expects
  // imports still in flight, like the runner's test files, to finish first.
  nextTick: (callback, ...args) => {
    ticks.push(() => callback(...args))
    if (!ticksScheduled) {
      ticksScheduled = true
      startTimer(drainTicks, 0)
    }
  },
  exit: (code = 0) => {
    const options = JSON.parse(process.env.PW_OPTIONS)
    if (code === 0) {
      if (options.mode === 'worker') {
        postMessage({
          pwRunEnded: true,
          pwRunFailed: false,
        })
      } else {
        globalThis.PW_TEST.end(false)
      }
    } else if (options.mode === 'worker') {
      postMessage({
        pwRunEnded: true,
        pwRunFailed: true,
      })
    } else {
      globalThis.PW_TEST.end(true)
    }
  },
  stdout: {
    write: (message) => {
      if (globalThis.PW_TEST_STDOUT_WRITE) {
        globalThis.PW_TEST_STDOUT_WRITE(message)
      } else {
        postMessage({ pwStdout: message })
      }
    },
    getColorDepth: () => 256,
    isTTY: true,
  },
  stderr: {
    write: (message) => {
      if (globalThis.PW_TEST_STDERR_WRITE) {
        globalThis.PW_TEST_STDERR_WRITE(message)
      } else {
        postMessage({ pwStderr: message })
      }
    },
    getColorDepth: () => 256,
    isTTY: true,
  },
  hrtime,
}

export const process = p
// https://github.com/ionic-team/rollup-plugin-node-polyfills
