/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
// The browser implementations in Node.js. See assert-compare.js.
import { assert } from '../../src/polyfills/assert.js'
import util from '../../src/polyfills/util.js'
import { run } from './assert-cases.js'
import { runUtil } from './util-cases.js'

console.log('IMPL browser')
await runUtil(util)
await run(assert)
