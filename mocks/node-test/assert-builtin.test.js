/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import nodeAssert from 'node:assert'
import strict from 'node:assert/strict'
import assert, { deepEqual, legacy } from 'playwright-test/taps/node-assert'

strict.strictEqual(assert, strict)
strict.strictEqual(legacy, nodeAssert)
strict.strictEqual(deepEqual, strict.deepEqual)

console.log('EXPORTS OK')
