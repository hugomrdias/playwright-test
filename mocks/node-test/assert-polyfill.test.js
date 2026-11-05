/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
// The browser implementation in Node.js. See assert-compare.js.
import { assert } from '../../src/taps/node-assert-polyfill.js'
import { run } from './assert-cases.js'

console.log('IMPL browser')
await run(assert)
