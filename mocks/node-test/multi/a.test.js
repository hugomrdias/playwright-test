/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { beforeEach, test } from '../../../src/taps/node-test.js'

beforeEach((t) => console.log(`ORDER root beforeEach ${t.name}`))
test('from file a', () => console.log('ORDER a'))
