import { strict as assert } from 'assert'
import * as Client from '../../src/client/index.ts'
import { test } from '../../src/node/test.ts'

// The input goes to the page, a worker running the tests can't see it
const inPage = globalThis.document !== undefined

test('page.click is trusted input', { skip: !inPage }, async () => {
  const button = document.createElement('button')
  button.id = 'pw-button'
  button.textContent = 'click'
  document.body.append(button)
  /** @type {Promise<MouseEvent>} */
  const clicked = new Promise((resolve) => {
    button.addEventListener('click', resolve, { once: true })
  })

  await Client.page.click('#pw-button')
  const event = await clicked
  assert.equal(event.isTrusted, true)
  if ('userActivation' in navigator) {
    assert.equal(navigator.userActivation.hasBeenActive, true)
  }
  button.remove()
})

test('page.keyboard types and presses', { skip: !inPage }, async () => {
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  /** @type {KeyboardEvent[]} */
  const keys = []
  input.addEventListener('keydown', (e) => keys.push(e))

  await Client.page.keyboard.type('hi')
  await Client.page.keyboard.press('Enter')
  assert.equal(input.value, 'hi')
  assert.deepEqual(
    keys.map((e) => e.key),
    ['h', 'i', 'Enter']
  )
  assert.equal(
    keys.every((e) => e.isTrusted),
    true
  )
  input.remove()
})

test('page input from anywhere goes to the page', async () => {
  // The test page is empty, nothing there passes the actionability checks
  await Client.page.click('html', { force: true })
  await Client.page.keyboard.press('Shift')
  await Client.page.keyboard.type('')
})

test('page.click rejects with the error of Playwright', async () => {
  await assert.rejects(Client.page.click('#nope', { timeout: 100 }), {
    message: /Timeout 100ms/,
  })
})
