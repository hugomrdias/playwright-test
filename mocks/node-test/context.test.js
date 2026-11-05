/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/** biome-ignore-all lint/suspicious/useAwait: testing async functions */
import { strict as assert } from 'assert'
import { before, beforeEach, describe, it, test } from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

test('name and fullName', (t) => {
  assert.equal(t.name, 'name and fullName')
  assert.equal(t.fullName, 'name and fullName')
})

describe('a suite', (s) => {
  assert.equal(s.name, 'a suite')
  assert.equal(s.fullName, 'a suite')
  describe('nested', () => {
    it('has the full name', (t) => {
      assert.equal(t.name, 'has the full name')
      assert.equal(t.fullName, 'a suite > nested > has the full name')
    })
  })
})

test('this is the context', function (t) {
  assert.equal(this, t)
})

test('subtests', async (t) => {
  log('parent start')
  await t.test('first subtest', (st) => {
    log('first subtest')
    assert.equal(st.fullName, 'subtests > first subtest')
  })
  await t.test('second subtest', async (st) => {
    log('second subtest')
    await st.test('nested subtest', () => log('nested subtest'))
  })
  log('parent end')
})

test('subtests that are not awaited run in order and are waited for', (t) => {
  t.test('not awaited 1', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    log('not awaited 1')
  })
  t.test('not awaited 2', () => log('not awaited 2'))
  log('not awaited parent end')
})

test('t.test returns a promise and has all the signatures', async (t) => {
  assert.ok(t.test('promise') instanceof Promise)
  await t.test({ timeout: 1000 }, function subOptionsFn() {
    log('subOptionsFn')
  })
  await t.test(function subFn() {
    log('subFn')
  })
  await t.test('skip', { skip: true }, () => log('NOT RUN'))
  await t.test('todo', { todo: true }, () => log('sub todo'))
})

test('global test and describe in a test are subtests', async () => {
  await test('global in a test', (t) => {
    assert.equal(
      t.fullName,
      'global test and describe in a test are subtests > global in a test'
    )
  })
  await describe('describe in a test', () => {
    it('it in a describe in a test', () => log('it in a describe in a test'))
  })
})

test('t.skip', (t) => {
  t.skip('skipped at runtime')
  log('t.skip keeps running')
})

test('t.skip without reason', (t) => {
  t.skip()
})

test('t.skip and then a throw', (t) => {
  t.skip('the skip wins')
  throw new Error('reported, but it does not fail the run')
})

test('t.todo', (t) => {
  t.todo('todo at runtime')
  log('t.todo keeps running')
})

test('t.todo and failure', (t) => {
  t.todo('todo at runtime')
  throw new Error('expected')
})

test('t.diagnostic', (t) => {
  t.diagnostic('a diagnostic message')
})

test('t.plan matches', (t) => {
  t.plan(2)
  t.assert.ok(true)
  t.assert.equal(1, 1)
})

test('t.plan counts subtests', async (t) => {
  t.plan(2)
  t.assert.ok(true)
  await t.test('counted', () => log('counted'))
})

test('t.plan option', { plan: 1 }, (t) => {
  t.assert.ok(true)
})

test('t.plan wait', async (t) => {
  t.plan(1, { wait: 1000 })
  setTimeout(() => t.assert.ok(true), 10)
})

test('t.assert', (t) => {
  // loose like node:assert, not strict
  t.assert.equal(1, '1')
  t.assert.strictEqual(1, 1)
  t.assert.notEqual(1, 2)
  t.assert.notStrictEqual(1, '1')
  t.assert.deepEqual({ a: 1 }, { a: '1' })
  t.assert.deepStrictEqual({ a: 1 }, { a: 1 })
  t.assert.notDeepEqual({ a: 1 }, { a: 2 })
  t.assert.notDeepStrictEqual({ a: 1 }, { a: '1' })
  t.assert.ok(true)
  t.assert.match('foo', /foo/)
  t.assert.doesNotMatch('foo', /bar/)
  t.assert.throws(() => {
    throw new Error('x')
  })
  t.assert.doesNotThrow(() => 1)
  t.assert.ifError(null)
})

test('t.assert async', async (t) => {
  await t.assert.rejects(Promise.reject(new Error('x')))
  await t.assert.doesNotReject(Promise.resolve())
})

test('t.signal', async (t) => {
  assert.ok(t.signal instanceof AbortSignal)
  assert.equal(t.signal.aborted, false)
  await t.test('sub', (st) => assert.equal(st.signal.aborted, false))
})

const signals = /** @type {AbortSignal[]} */ ([])
test('t.signal aborts at the end', (t) => {
  signals.push(t.signal)
})
test('t.signal aborted', () => {
  assert.equal(signals[0].aborted, true)
})

test('t.before and t.after', async (t) => {
  t.before(() => log('t.before'))
  t.after(() => log('t.after 1'))
  t.after(() => log('t.after 2'))
  await t.test('sub', () => log('t.before sub'))
  log('t.before end')
})

test('t.beforeEach and t.afterEach', async (t) => {
  t.beforeEach((st) => log(`t.beforeEach ${st.name}`))
  t.afterEach((st) => log(`t.afterEach ${st.name}`))
  await t.test('sub 1', () => log('sub 1'))
  await t.test('sub 2', async (st) => {
    await st.test('sub 2 nested', () => log('sub 2 nested'))
  })
})

test('callback', (_t, done) => {
  log('callback')
  setTimeout(done, 1)
})

describe('callback in hooks', () => {
  before((_s, done) => {
    log('callback before')
    setTimeout(done, 1)
  })
  beforeEach((_t, done) => {
    log('callback beforeEach')
    done()
  })
  it('callback test', (_t, done) => {
    log('callback test')
    done()
  })
})

test('mock on the context', (t) => {
  const fn = t.mock.fn(() => 1)
  fn()
  assert.equal(fn.mock.callCount(), 1)
})

test('t.waitFor', async (t) => {
  let count = 0
  const result = await t.waitFor(
    () => {
      count++
      assert.equal(count, 3)
      return 'done'
    },
    { interval: 1 }
  )
  assert.equal(result, 'done')
})

test('t.runOnly filters later subtests', async (t) => {
  // Only does something when filtering, which real node:test requires a flag for
  t.runOnly(false)
  await t.test('still runs', () => log('still runs'))
})

test('passed and error', async (t) => {
  assert.equal(t.passed, false)
  assert.equal(t.error, null)
  assert.equal(t.attempt, 0)
  assert.equal(typeof t.tags, 'object')
})

test('async fn that resolves', async () => {
  await new Promise((resolve) => setTimeout(resolve, 1))
})

test('a thenable', () => ({
  // biome-ignore lint/suspicious/noThenProperty: testing it
  then(/** @type {() => void} */ resolve) {
    resolve()
  },
}))
