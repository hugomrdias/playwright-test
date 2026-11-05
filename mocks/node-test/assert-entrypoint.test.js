/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
// The package entrypoint in a browser bundle. See assert-compare.js.
import { legacy } from '../../src/taps/node-assert.js'
import { assert } from '../../src/taps/node-assert-polyfill.js'
import { run } from './assert-cases.js'

console.log(`IMPL ${legacy === assert ? 'browser' : 'builtin'}`)
await run(legacy)
// Console messages are read asynchronously, give the last one time to arrive.
await new Promise((resolve) => setTimeout(resolve, 100))
process.exit(0)
