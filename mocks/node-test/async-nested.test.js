/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { describe, it, test } from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)
const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

describe('sync outer', () => {
  describe('async inner', async () => {
    await tick()
    it('in inner', (t) => log(t.fullName))
  })
  it('in outer', (t) => log(t.fullName))
})

await new Promise((resolve) => setTimeout(resolve, 20))

// The outer suite is done by now, this belongs to the root.
test('declared after the await', (t) => log(t.fullName))
describe('suite after the await', () => {
  it('nested', (t) => log(t.fullName))
})
