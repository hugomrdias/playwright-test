/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { before, describe, it, test } from 'node:test'

describe('suite a', () => {
  it('alpha one', () => {
    // noop
  })
  it('beta', () => {
    // noop
  })
})

describe('suite b', () => {
  it('alpha two', () => {
    // noop
  })
})

describe('other', () => {
  before(() => console.log('other hook'))
  it('gamma', () => {
    // noop
  })
})

test('alpha top', () => {
  // noop
})

test('delta', async (t) => {
  await t.test('alpha nested', () => {
    // noop
  })
})
