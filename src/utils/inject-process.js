// @ts-nocheck
// eslint-disable-next-line unicorn/prefer-module
const _process = require('process/browser')
const performance = globalThis.performance || {}
const performanceNow =
  performance.now ||
  function () {
    return Date.now()
  }

// generate timestamp or delta
// see http://nodejs.org/api/process.html#process_process_hrtime
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
  ..._process,
  exit: (code = 0) => {
    if (code === 0) {
      if (process.env.PW_TEST.mode === 'worker') {
        postMessage({
          pwRunEnded: true,
          pwRunFailed: false,
        })
      } else {
        globalThis.PW_TEST.end(false)
      }
    } else {
      if (process.env.PW_TEST.mode === 'worker') {
        postMessage({
          pwRunEnded: true,
          pwRunFailed: true,
        })
      } else {
        globalThis.PW_TEST.end(true)
      }
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
  },
  stderr: {
    write: (message) => {
      if (globalThis.PW_TEST_STDERR_WRITE) {
        globalThis.PW_TEST_STDERR_WRITE(message)
      } else {
        postMessage({ pwStderr: message })
      }
    },
    getColorDepth = () => 256,
    isTTY: true
  },
  hrtime,
}

export const process = p
// https://github.com/ionic-team/rollup-plugin-node-polyfills
