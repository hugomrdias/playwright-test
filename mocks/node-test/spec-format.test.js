import { strictEqual } from 'assert'
import { after, describe, it, test } from '../../src/node/test.js'

describe('suite a', () => {
  it('passes', (t) => {
    t.diagnostic('a note')
  })
  it('fails', () => {
    throw new Error('boom', { cause: new TypeError('why') })
  })
  describe('nested', () => {
    it.skip('skipped')
    it.todo('todo')
    it('deep', () => {
      // noop
    })
  })
})

describe('suite after', () => {
  after(() => {
    throw new Error('after throws')
  })
  it('ok', () => {
    // noop
  })
})

describe.skip('suite skipped', () => {
  it('not reported', () => {
    // noop
  })
})

test('parent', async (t) => {
  await t.test('child', () => {
    // noop
  })
  await t.test('child fails', () => {
    throw new Error('child')
  })
})

test('skip reason', { skip: 'because' }, () => {
  // noop
})
test('todo reason fails', { todo: 'later' }, () => {
  throw new Error('todo fails')
})
test('throws undefined', () => {
  throw undefined
})
test('assert', () => {
  strictEqual(1, 2)
})
test('slow', { timeout: 10 }, () => {
  return new Promise((resolve) => setTimeout(resolve, 100))
})
