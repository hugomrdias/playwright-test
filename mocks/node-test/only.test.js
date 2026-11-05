/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/** biome-ignore-all lint/suspicious/noFocusedTests: testing them */
import { before, describe, it, test } from '../../src/taps/node-test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

test('not only', () => log('NOT RUN not only'))
test.only('test.only', () => log('test.only'))
test('only option', { only: true }, () => log('only option'))
it.only('it.only', () => log('it.only'))

describe('no only inside', () => {
  log('body of a filtered suite runs')
  before(() => log('NOT RUN hook of a filtered suite'))
  it('filtered', () => log('NOT RUN filtered'))
})

describe.only('describe.only runs everything inside', () => {
  it('a', () => log('describe.only a'))
  it('b', () => log('describe.only b'))
})

describe('an only inside', () => {
  it('filtered', () => log('NOT RUN filtered sibling'))
  it.only('runs', () => log('nested only'))
  describe('deeper', () => {
    it.only('deeper runs', () => log('deeper only'))
    it('deeper filtered', () => log('NOT RUN deeper filtered'))
  })
})

describe.only('describe.only with an only inside', () => {
  it('filtered', () => log('NOT RUN filtered by inner only'))
  it.only('runs', () => log('inner only'))
})

test.only('runOnly', async (t) => {
  await t.test('a', { only: true }, () => log('subtest only'))
  await t.test('b', () => log('NOT RUN subtest b'))
})
