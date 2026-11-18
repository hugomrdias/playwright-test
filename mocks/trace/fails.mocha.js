import { strictEqual as is } from 'node:assert/strict'

it('fails', () => {
  document.body.textContent = 'trace-fails'
  is(1, 2)
})
