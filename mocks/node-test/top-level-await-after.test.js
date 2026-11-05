/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { after, test } from '../../src/taps/node-test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

after(() => log('root after'))

await test('first', () => log('first'))
await test('second', () => log('second'))
