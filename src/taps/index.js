import { suite } from './harness.js'

/**
 * @typedef {import('./types.js').Suite} Suite
 */

export const test = suite()

export * from './assert.js'
export { exec, hold } from './exec.js'
export { configure, suite } from './harness.js'
