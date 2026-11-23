/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
import { strictEqual } from 'node:assert'

strictEqual(globalThis.isolationMark, undefined)
globalThis.isolationMark = 'b'
console.log('none b ran')
