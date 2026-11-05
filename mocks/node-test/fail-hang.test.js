/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { test } from '../../src/taps/node-test.js'

test('never settles', () =>
  new Promise(() => {
    // noop
  }))
test('never starts', () => console.log('NOT RUN'))
