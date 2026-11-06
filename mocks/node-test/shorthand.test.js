/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { expectFailure, only, skip, test, todo } from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

log(`${typeof expectFailure} ${typeof only}`)
skip('skip export', () => log('NOT RUN skip export'))
todo('todo export', () => log('todo export'))
test('test', () => log('test'))
