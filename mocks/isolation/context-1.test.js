import { strictEqual } from 'node:assert'

// Runs at the same time as the other one, in a browser context of its own
describe('context 1', () => {
  it('keeps its own storage', async () => {
    strictEqual(localStorage.getItem('context'), null)
    localStorage.setItem('context', '1')
    await new Promise((resolve) => setTimeout(resolve, 500))
    strictEqual(localStorage.getItem('context'), '1')
  })
})
