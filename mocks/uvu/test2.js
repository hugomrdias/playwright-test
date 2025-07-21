import delay from 'delay'
import { suite } from 'uvu'
import { is, type } from 'uvu/assert'

const test = suite('suite')

test('sum', () => {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: <explanation>
  type(() => {}, 'function')
  is(3, 3)
})

test('sum', async () => {
  await delay(2000)
  // biome-ignore lint/suspicious/noEmptyBlockStatements: <explanation>
  type(() => {}, 'function')
  is(3, 3)
})
test.run()
