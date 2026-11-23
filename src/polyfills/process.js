// @ts-nocheck
/**
 * `node:process` for browsers, bundles resolve `process` to this file and
 * `src/utils/inject-process.js` makes it the global too. `stdout`, `stderr` and
 * `exit` talk to the runner, what a browser can't do is a no-op or throws.
 */
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

/** @type {[string | undefined, any]} */
let stdioCache = [undefined, undefined]

/**
 * What the runner says about its own stream in `PW_STDIO`, see
 * `src/base-runner.js`. Without it the stream is a TTY with 256 colors.
 *
 * @param {'stdout' | 'stderr'} name
 * @returns {{ isTTY: boolean, colorDepth: number }}
 */
function runnerStream(name) {
  const value = p.env.PW_STDIO
  if (stdioCache[0] !== value) {
    let parsed
    try {
      parsed = value ? JSON.parse(value) : undefined
    } catch {
      parsed = undefined
    }
    stdioCache = [value, parsed]
  }
  const stream = stdioCache[1]?.[name]
  return {
    isTTY: stream?.isTTY ?? true,
    colorDepth: stream?.colorDepth ?? 8,
  }
}

/**
 * A stream that writes to the runner. Pages have a binding for it and workers can
 * only post to the page, which is more than service workers can do.
 *
 * @param {'stdout' | 'stderr'} name
 * @param {string} binding
 * @param {string} key
 * @param {'log' | 'error'} method
 */
function createStream(name, binding, key, method) {
  return {
    write(message, encoding, callback) {
      const done = typeof encoding === 'function' ? encoding : callback
      if (globalThis[binding]) {
        globalThis[binding](message).then(
          () => done?.(),
          (error) => done?.(error)
        )
      } else if (typeof postMessage === 'function') {
        postMessage({ [key]: message })
        if (done) {
          startTimer(done, 0)
        }
      } else {
        const text =
          typeof message === 'string'
            ? message
            : new TextDecoder().decode(message)
        // biome-ignore lint/suspicious/noConsole: the only way out of a service worker
        console[method](text.replace(/\n$/, ''))
        if (done) {
          startTimer(done, 0)
        }
      }
      return true
    },
    getColorDepth: (env = p.env) => {
      if (env?.FORCE_COLOR !== undefined) {
        switch (env.FORCE_COLOR) {
          case '':
          case '1':
          case 'true':
            return 4
          case '2':
            return 8
          case '3':
            return 24
          default:
            return 1
        }
      }
      if (
        (env?.NODE_DISABLE_COLORS !== undefined &&
          env.NODE_DISABLE_COLORS !== '') ||
        (env?.NO_COLOR !== undefined && env.NO_COLOR !== '') ||
        env?.TERM === 'dumb'
      ) {
        return 1
      }
      return runnerStream(name).colorDepth
    },
    get isTTY() {
      return runnerStream(name).isTTY
    },
  }
}

const p = {
  title: 'browser',
  browser: true,
  env: {},
  argv: [],
  exitCode: undefined,
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
  /** @param {[code?: number]} args */
  exit: (...args) => {
    // Like Node, only an omitted argument falls back to process.exitCode.
    const exitCode = args.length === 0 ? p.exitCode : args[0]
    const options = JSON.parse(p.env.PW_OPTIONS)
    const failed = Number(exitCode ?? 0) !== 0
    if (options.mode === 'web-worker') {
      postMessage({
        pwRunEnded: true,
        pwRunFailed: failed,
      })
    } else {
      globalThis.PW_TEST.end(failed)
    }
  },
  stdout: createStream('stdout', 'PW_TEST_STDOUT_WRITE', 'pwStdout', 'log'),
  stderr: createStream('stderr', 'PW_TEST_STDERR_WRITE', 'pwStderr', 'error'),
  hrtime,
}

export const process = p
export default p

export { hrtime }
export const {
  addListener,
  argv,
  binding,
  browser,
  chdir,
  cwd,
  emit,
  env,
  exit,
  listeners,
  nextTick,
  off,
  on,
  once,
  prependListener,
  prependOnceListener,
  removeAllListeners,
  removeListener,
  stderr,
  stdout,
  title,
  umask,
  version,
  versions,
} = p
