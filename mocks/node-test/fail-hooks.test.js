/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  test,
} from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

describe('before throws', () => {
  before(() => {
    throw new Error('before throws')
  })
  after(() => log('after runs when before throws'))
  it('cancelled 1', () => log('NOT RUN cancelled 1'))
  it('cancelled 2', () => log('NOT RUN cancelled 2'))
  describe('nested cancelled', () => {
    log('nested cancelled body')
    it('cancelled 3', () => log('NOT RUN cancelled 3'))
  })
})

describe('after throws', () => {
  after(() => {
    throw new Error('after throws')
  })
  it('passes and the suite fails', () => log('passes and the suite fails'))
})

describe('beforeEach throws', () => {
  beforeEach(() => {
    throw new Error('beforeEach throws')
  })
  afterEach((t) => log(`afterEach runs ${t.name}`))
  it('fails 1', () => log('NOT RUN fails 1'))
  it('fails 2', () => log('NOT RUN fails 2'))
})

describe('afterEach throws', () => {
  afterEach(() => {
    throw new Error('afterEach throws')
  })
  it('fails after running', () => log('fails after running'))
})

describe('beforeEach only in one suite', () => {
  describe('with the throwing hook', () => {
    beforeEach(() => {
      throw new Error('scoped')
    })
    it('fails scoped', () => log('NOT RUN fails scoped'))
  })
  it('not affected', () => log('not affected'))
})

describe('suite body throws', () => {
  it('declared before the throw', () => log('NOT RUN declared'))
  throw new Error('suite body throws')
})

test('t.after throws', (t) => {
  t.after(() => {
    throw new Error('t.after throws')
  })
})

test('t.before throws', async (t) => {
  t.before(() => {
    throw new Error('t.before throws')
  })
  await t.test('sub after failed before', () => log('NOT RUN sub'))
})

test('t.beforeEach throws', async (t) => {
  t.beforeEach(() => {
    throw new Error('t.beforeEach throws')
  })
  await t.test('sub with failed beforeEach', () => log('NOT RUN sub 2'))
})

test('t.afterEach throws', async (t) => {
  t.afterEach(() => {
    throw new Error('t.afterEach throws')
  })
  await t.test('sub with failed afterEach', () => log('sub 3'))
})

describe('hook timeout', () => {
  beforeEach(
    () =>
      new Promise(() => {
        // noop
      }),
    { timeout: 20 }
  )
  it('fails on the hook timeout', () => log('NOT RUN hook timeout'))
})

describe('callback hook', () => {
  before((_t, done) => {
    done(new Error('callback hook'))
  })
  it('cancelled by callback', () => log('NOT RUN cancelled by callback'))
})

test('still runs at the end', () => log('still runs at the end'))
