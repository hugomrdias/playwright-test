import { strictEqual } from 'node:assert'
import * as Client from '../../src/client/index.ts'

describe('keyboard', () => {
  it('reaches the document of the tests without a focused element', async () => {
    const pressed = new Promise((resolve) => {
      document.addEventListener('keydown', (e) => resolve(e.key), {
        once: true,
      })
    })
    await Client.page.keyboard.press('Escape')
    strictEqual(await pressed, 'Escape')
  })
})
