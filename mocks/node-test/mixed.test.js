/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */

import { assert, suite, test as tapsTest } from '../../src/taps/index.js'
import { describe, it, test as nodeTest } from '../../src/taps/node-test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

tapsTest('taps default suite', () => {
  log('taps default suite')
  assert.equal(1, 1)
})

nodeTest('node test', (t) => {
  log('node test')
  t.assert.equal(1, 1)
})

const named = suite('taps named')
named('taps named test', () => log('taps named test'))

describe('node suite', () => {
  it('node nested', () => log('node nested'))
})
