/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { test } from '../../../src/node/test.js'

test('from file b', () => console.log('ORDER b'))
