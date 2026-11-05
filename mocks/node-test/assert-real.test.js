// The real thing to compare with, only for Node.js. See assert-compare.js.
import assert from 'node:assert'
import { run } from './assert-cases.js'

await run(assert)
