// The real thing to compare with, only for Node.js. See assert-compare.js.
import assert from 'node:assert'
import util from 'node:util'
import { run } from './assert-cases.js'
import { runUtil } from './util-cases.js'

await runUtil(util)
await run(assert)
