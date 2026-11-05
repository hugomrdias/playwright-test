/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { afterEach, beforeEach, test } from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

beforeEach((t) => {
  if (t.name === 'beforeEach fails') {
    throw new Error('root beforeEach throws')
  }
})
afterEach((t) => {
  if (t.name === 'afterEach fails') {
    throw new Error('root afterEach throws')
  }
})

test('beforeEach fails', () => log('NOT RUN beforeEach fails'))
test('afterEach fails', () => log('afterEach fails'))
test('passes', () => log('passes'))
