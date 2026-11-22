/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { test } from 'node:test'
import { styleText } from 'node:util'

test('styles text', () => {
  console.log('STYLED', JSON.stringify(styleText('red', 'x')))
})
