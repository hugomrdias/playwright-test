import { strictEqual as is } from 'node:assert/strict'

it('fails first', () => {
  is(1, 2)
})

it('runs without bail', () => {
  // noop
})
