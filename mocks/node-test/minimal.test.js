/** biome-ignore-all lint/suspicious/noConsole: it's what's being tested */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: tests that only pass */

import { before, describe, it, test } from 'playwright-test/node-test'

console.log('\u001B[35mtest color\u001B[39m')

before((t) => {
  t.diagnostic('root hidden')
})

describe('outer', () => {
  describe('inner', () => {
    it('nested hidden', () => {
      console.log('console from a passing test')
    })
    it('nested fails', (t) => {
      t.diagnostic('shown with the failure')
      throw new Error('boom')
    })
    it('skipped hidden', { skip: true }, () => {})
  })
  it('sibling hidden', (t) => {
    t.diagnostic('hidden diagnostic')
  })
})

test('top fails', () => {
  throw new Error('boom')
})

test('todo fails', { todo: true }, () => {
  throw new Error('known')
})
