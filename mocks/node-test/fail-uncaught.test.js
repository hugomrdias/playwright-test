/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { test } from '../../src/taps/node-test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

test('uncaught exception', () => {
  setTimeout(() => {
    throw new Error('uncaught exception')
  }, 0)
  return new Promise((resolve) => setTimeout(resolve, 200))
})

test('unhandled rejection', () => {
  Promise.reject(new Error('unhandled rejection'))
  return new Promise((resolve) => setTimeout(resolve, 200))
})

test('callback never called but throws', (_t, _done) => {
  setTimeout(() => {
    throw new Error('thrown in the callback test')
  }, 0)
})

test('still runs at the end', () => log('still runs at the end'))
