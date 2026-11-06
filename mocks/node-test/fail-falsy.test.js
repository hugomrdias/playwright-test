/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { test } from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

test('throws undefined', () => {
  throw undefined
})
test('rejects with nothing', () => Promise.reject())
test('runs after', () => log('runs after'))
