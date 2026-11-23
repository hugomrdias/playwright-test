/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { test } from '../../../src/node/test.ts'

test('from file b', () => console.log('ORDER b'))
