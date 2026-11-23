/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { describe, it, test } from '../../src/node/test.ts'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

describe('a suite', { tags: ['UI', 'fast'] }, () => {
  it(
    'lowercase, inherited and without duplicates',
    {
      tags: ['Fast', 'Slow', 'slow'],
    },
    (t) => log(`tags ${JSON.stringify(t.tags)}`)
  )
  it('only inherited', (t) => log(`tags ${JSON.stringify(t.tags)}`))
})

test('a test', { tags: ['X'] }, async (t) => {
  log(`tags ${JSON.stringify(t.tags)}`)
  await t.test('a subtest', { tags: ['x', 'y'] }, (t) =>
    log(`tags ${JSON.stringify(t.tags)}`)
  )
})

test('no tags', (t) => log(`tags ${JSON.stringify(t.tags)}`))

test('frozen', { tags: ['core'] }, async (t) => {
  log(`frozen ${Object.isFrozen(t.tags)}`)
  await t.test('child', (t) => log(`frozen child ${Object.isFrozen(t.tags)}`))
})

for (const tags of [
  'x',
  null,
  [1],
  [null],
  [{}],
  [''],
  ['a b'],
  ['a*'],
  ['AND'],
  ['Not'],
  ['a,b', 'a-b', 'a:b', 'ü'],
  'x'.repeat(40),
  [`${'a'.repeat(140)}*`],
  // Only ASCII whitespace is forbidden
  ['a\vb'],
  ['UI\u00a0Smoke', 'a\u2003b'],
  // A hole is `undefined`
  // biome-ignore lint/suspicious/noSparseArray: testing it
  [, 'a'],
  Object.assign(['own-entries'], { entries: undefined }),
]) {
  try {
    test('validated', { tags }, () => {
      // noop
    })
    log(`valid ${JSON.stringify(tags).slice(0, 60)}`)
  } catch (error) {
    log(`invalid ${error.code} ${error.name} ${error.message}`)
  }
}
