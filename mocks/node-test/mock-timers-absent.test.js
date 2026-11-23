/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { test } from '../../src/node/test.ts'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

// Like `setImmediate` in browsers, and `AbortSignal.timeout` in older ones
test('mocks what is missing and removes it again', (t) => {
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')
  const immediate = Object.getOwnPropertyDescriptor(globalThis, 'setImmediate')
  // @ts-expect-error removed to test without it
  delete AbortSignal.timeout
  // @ts-expect-error removed to test without it
  delete globalThis.setImmediate
  try {
    t.mock.timers.enable({ apis: ['AbortSignal.timeout', 'setImmediate'] })
    const signal = AbortSignal.timeout(5)
    setImmediate(() => log('immediate'))
    t.mock.timers.tick(5)
    log(`aborted ${signal.aborted}`)
    t.mock.timers.reset()
    log(`timeout removed ${!('timeout' in AbortSignal)}`)
    log(`setImmediate removed ${!('setImmediate' in globalThis)}`)
  } finally {
    if (timeout) {
      Object.defineProperty(AbortSignal, 'timeout', timeout)
    }
    if (immediate) {
      Object.defineProperty(globalThis, 'setImmediate', immediate)
    }
  }
})
