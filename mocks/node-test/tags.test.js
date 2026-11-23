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
]) {
  try {
    test('validated', { tags }, () => {
      // noop
    })
    log(`valid ${JSON.stringify(tags)}`)
  } catch (error) {
    log(`invalid ${error.code} ${error.name} ${error.message}`)
  }
}
