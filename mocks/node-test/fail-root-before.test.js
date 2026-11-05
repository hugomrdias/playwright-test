/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { before, describe, it, test } from '../../src/taps/node-test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

before(() => {
  throw new Error('root before throws')
})

test('top level', () => log('NOT RUN top level'))
describe('a suite', () => {
  it('in a suite', () => log('NOT RUN in a suite'))
})
