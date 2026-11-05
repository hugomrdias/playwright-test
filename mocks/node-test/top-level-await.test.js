/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { describe, it, test } from '../../src/taps/node-test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

log('start')
const result = await test('first awaited', async () => {
  await new Promise((resolve) => setTimeout(resolve, 5))
  log('first awaited')
})
log(`after first ${result}`)
await describe('awaited suite', () => {
  log('awaited suite body')
  it('in the awaited suite', () => log('in the awaited suite'))
})
log('after suite')
await test('fails but the promise resolves', () => {
  throw new Error('expected')
})
log('still going')
test('not awaited', () => log('not awaited'))
await test('awaited last', () => log('awaited last'))
await test('then').then(() => log('then called'))
