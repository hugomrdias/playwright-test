/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/** biome-ignore-all lint/suspicious/noFocusedTests: testing them */

import { suite, test as tapsTest } from '../../src/taps/index.js'
import { test as nodeTest } from '../../src/taps/node-test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

tapsTest('taps filtered', () => log('NOT RUN taps filtered'))
nodeTest('node filtered', () => log('NOT RUN node filtered'))
nodeTest.only('node only', () => log('node only'))
suite('taps named').only('taps only', () => log('taps only'))
