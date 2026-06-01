import delay from 'delay'
import { test } from 'uvu'
import { is, type } from 'uvu/assert'

test('sum', () => {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: test
  type(() => {}, 'function')
  is(3, 3)
})

test('sum', async () => {
  await delay(100)
  // biome-ignore lint/suspicious/noEmptyBlockStatements: test
  type(() => {}, 'function')
  is(3, 3)
})
test.run()
