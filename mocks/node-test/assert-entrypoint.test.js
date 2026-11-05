/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
// The bare specifiers and the package entrypoint in a browser bundle. See assert-compare.js.
import util from 'util'
import { legacy } from '../../src/node/assert.js'
import { assert } from '../../src/polyfills/assert.js'
import { run } from './assert-cases.js'
import { runUtil } from './util-cases.js'

console.log(`IMPL ${legacy === assert ? 'browser' : 'builtin'}`)
await runUtil(util)
await run(legacy)
// Console messages are read asynchronously, give the last one time to arrive.
await new Promise((resolve) => setTimeout(resolve, 100))
process.exit(0)
