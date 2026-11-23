/** biome-ignore-all lint/suspicious/noConsole: the tests read what it prints */
import { strictEqual } from 'node:assert'

strictEqual(globalThis.isolationMark, undefined)
globalThis.isolationMark = 'a'
console.log('none a ran')
