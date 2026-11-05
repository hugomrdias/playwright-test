/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/** biome-ignore-all lint/suspicious/useAwait: testing async functions */
import { strict as assert } from 'assert'
import { describe, it, test } from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

test('passes', () => log('passes'))
test('sync throw', () => {
  throw new Error('sync throw')
})
test('rejects', async () => {
  await Promise.reject(new Error('rejects'))
})
test('assertion', () => {
  assert.equal(1, 2)
})
test('throws a string', () => {
  throw 'a string'
})
test('throws undefined', () => {
  throw undefined
})
test('rejects with nothing', () => Promise.reject())
test('callback error', (_t, done) => {
  done(new Error('callback error'))
})
test('callback and promise', async (_t, done) => {
  done()
})
test('plan too few', (t) => {
  t.plan(2)
  t.assert.ok(true)
})
test('plan too many', (t) => {
  t.plan(1)
  t.assert.ok(true)
  t.assert.ok(true)
})
test('plan twice', (t) => {
  t.plan(1)
  t.plan(1)
})
test('t.assert fails', (t) => {
  t.assert.equal(1, 2)
})
test('timeout', { timeout: 20 }, async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000))
})
test('timeout aborts the signal', { timeout: 20 }, (t) => {
  return new Promise((resolve) => {
    t.signal.addEventListener('abort', resolve)
  })
})
test('subtest fails the parent', async (t) => {
  await t.test('failing subtest', () => {
    throw new Error('failing subtest')
  })
  await t.test('next subtest still runs', () => log('next subtest still runs'))
  log('parent keeps running')
})
test('subtest not awaited fails the parent', (t) => {
  t.test('failing not awaited', async () => {
    await Promise.reject(new Error('failing not awaited'))
  })
})
test('nested subtest fails all the parents', async (t) => {
  await t.test('level 1', async (st) => {
    await st.test('level 2', () => {
      throw new Error('level 2')
    })
  })
})
describe('suite with a failure', () => {
  it('passes in suite', () => log('passes in suite'))
  it('fails in suite', () => {
    throw new Error('fails in suite')
  })
  it('runs after the failure', () => log('runs after the failure'))
  describe('nested failure', () => {
    it('fails nested', () => {
      throw new Error('fails nested')
    })
  })
})
describe('suite timeout', { timeout: 20 }, () => {
  it('slow in a suite with a timeout', async () => {
    await new Promise((resolve) => setTimeout(resolve, 200))
  })
  it('cancelled by the suite timeout', () => log('NOT RUN suite timeout'))
})
test('timeout is inherited by subtests', { timeout: 20 }, async (t) => {
  await t.test('slow subtest', async () => {
    await new Promise((resolve) => setTimeout(resolve, 200))
  })
})
test('plan wait times out', async (t) => {
  t.plan(1, { wait: 10 })
})
test('already aborted signal option', { signal: AbortSignal.abort() }, () =>
  log('NOT RUN aborted')
)
const controller = new AbortController()
test('signal option aborts while running', {
  signal: controller.signal,
}, () => {
  setTimeout(() => controller.abort(), 5)
  return new Promise(() => {
    // never settles, the signal ends it
  })
})
test('todo subtest does not fail the parent', async (t) => {
  await t.test('todo sub', { todo: true }, () => {
    throw new Error('expected')
  })
})
test('skipped subtest that throws fails the parent', async (t) => {
  await t.test('skip then throw sub', (st) => {
    st.skip()
    throw new Error('expected')
  })
})
const finished = /** @type {any[]} */ ([])
test('finishes before its late subtest', (t) => {
  finished.push(t)
})
test('creates a subtest on a finished test', () => {
  finished[0].test('too late', () => log('too late'))
})
test('throws with a subtest pending', (t) => {
  t.test('cancelled subtest', async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  t.test('pending subtest', () => log('NOT RUN pending subtest'))
  throw new Error('throws with a subtest pending')
})
test('callback called twice', (_t, done) => {
  done()
  done()
})
test('callback with a falsy error passes', (_t, done) => {
  done(null)
})
test('rejected thenable', () => ({
  // biome-ignore lint/suspicious/noThenProperty: testing it
  then(
    /** @type {() => void} */ _resolve,
    /** @type {(e: Error) => void} */ reject
  ) {
    reject(new Error('rejected thenable'))
  },
}))
describe('failing suite in a todo suite', { todo: true }, () => {
  describe('nested', () => {
    before(() => {
      throw new Error('expected')
    })
    it('cancelled in a todo', () => log('NOT RUN cancelled in a todo'))
  })
})
test('still runs at the end', () => log('still runs at the end'))
