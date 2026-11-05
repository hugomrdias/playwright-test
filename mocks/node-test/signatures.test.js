/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { strict as assert } from 'assert'
import defaultTest, { describe, it, suite, test } from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

// Exports
assert.equal(defaultTest, test)
assert.equal(test.test, test)
assert.equal(test.it, it)
assert.equal(test.describe, describe)
assert.equal(test.suite, suite)
assert.equal(typeof test.before, 'function')
assert.equal(typeof test.after, 'function')
assert.equal(typeof test.beforeEach, 'function')
assert.equal(typeof test.afterEach, 'function')
assert.equal(typeof test.mock.fn, 'function')

// test(name?, options?, fn?)
test('name only')
test('name and fn', () => log('name and fn'))
test('name, options and fn', { timeout: 1000 }, () => log('name options fn'))
test({ timeout: 1000 }, function optionsAndFn() {
  log('options and fn')
})
test(function fnOnly() {
  log('fn only')
})
test()
test(() => log('anonymous'))
test({ name: 'name in options' }, () => log('name in options'))
it('it works too', () => log('it'))

// A promise on all of them
assert.ok(test('returns a promise') instanceof Promise)
assert.ok(it('it returns a promise') instanceof Promise)
assert.ok(describe('describe returns a promise') instanceof Promise)
assert.ok(suite('suite returns a promise') instanceof Promise)

// skip
test.skip('test.skip', () => log('NOT RUN test.skip'))
it.skip('it.skip', () => log('NOT RUN it.skip'))
test('skip option', { skip: true }, () => log('NOT RUN skip option'))
test('skip reason', { skip: 'a reason' }, () => log('NOT RUN skip reason'))
test('skip false', { skip: false }, () => log('skip false runs'))
// Skipped, but it also runs. Not a typo, this is what node:test does.
test('skip empty reason', { skip: '' }, () => log('empty skip reason runs'))

// todo
test.todo('test.todo')
it.todo('it.todo')
test.todo('test.todo with fn', () => log('test.todo with fn runs'))
test('todo option', { todo: true }, () => log('todo option runs'))
test('todo reason', { todo: 'a reason' }, () => log('todo reason runs'))
test('failing todo', { todo: 'not done' }, () => {
  throw new Error('a todo that fails does not fail the run')
})

// suites
describe.skip('describe.skip', () => {
  log('NOT RUN describe.skip')
  it('in a skipped suite', () => log('NOT RUN skipped suite test'))
})
suite.skip('suite.skip', () => {
  log('NOT RUN suite.skip')
})
describe('skip option suite', { skip: 'a reason' }, () => {
  log('NOT RUN skip option suite')
})
describe.todo('describe.todo', () => {
  log('describe.todo body')
  it('in a todo suite', () => log('todo suite test'))
  it('failing in a todo suite', () => {
    throw new Error('expected, the suite is todo')
  })
})
suite.todo('suite.todo', () => {
  it('in suite.todo', () => log('suite.todo test'))
})
describe('todo option suite', { todo: true }, () => {
  it('in a todo option suite', () => log('todo option suite test'))
})

// Options that are accepted
describe('concurrency', { concurrency: 4 }, () => {
  it('a', { concurrency: true }, () => log('concurrency a'))
  it('b', { concurrency: 1 }, () => log('concurrency b'))
})

// Timeouts are inherited, and there's no default
describe('timeout', { timeout: 60_000 }, () => {
  it(
    'no timeout by default is more than the 5s of taps',
    { timeout: 6000 },
    () => log('timeout')
  )
})
test('timeout Infinity', { timeout: Number.POSITIVE_INFINITY }, () =>
  log('timeout infinity')
)
