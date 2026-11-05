/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/** biome-ignore-all lint/suspicious/noDuplicateTestHooks: testing them */
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  suite,
  test,
} from '../../src/taps/node-test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

before((t) => log(`root before ${t.name} ${t.fullName}`))
log('declared root before')
after(() => log('root after'))
beforeEach((t) => log(`root beforeEach ${t.name}`))
afterEach((t) => log(`root afterEach ${t.name}`))

test('first top level', () => log('first top level'))

describe('outer', () => {
  log('outer body')
  before((t) => log(`outer before ${t.name}`))
  after((t) => log(`outer after ${t.name}`))
  beforeEach((t) => log(`outer beforeEach ${t.name}`))
  afterEach((t) => log(`outer afterEach ${t.name}`))

  it('outer first', () => log('outer first'))

  describe('inner', () => {
    log('inner body')
    before(() => log('inner before'))
    after(() => log('inner after'))
    beforeEach(() => log('inner beforeEach'))
    afterEach(() => log('inner afterEach'))

    it('inner test', () => log('inner test'))
    suite('deepest', () => {
      beforeEach(() => log('deepest beforeEach'))
      test('deepest test', () => log('deepest test'))
    })
    it('inner last', () => log('inner last'))
  })

  it('outer between', async () => {
    await Promise.resolve()
    log('outer between')
  })

  describe('second inner', () => {
    it('second inner test', () => log('second inner test'))
  })

  it('outer last', () => log('outer last'))

  // Declared after the tests, but applies to all of them
  afterEach(() => log('outer late afterEach'))
})

it('between suites', (t) => {
  log(`between suites ${t.fullName}`)
})

describe('hook order', () => {
  beforeEach(() => log('beforeEach 1'))
  beforeEach(() => log('beforeEach 2'))
  afterEach(() => log('afterEach 1'))
  afterEach(() => log('afterEach 2'))
  before(() => log('before 1'))
  before(() => log('before 2'))
  after(() => log('after 1'))
  after(() => log('after 2'))
  it('runs', () => log('hook order test'))
})

describe('empty suite still runs its hooks', () => {
  before(() => log('empty before'))
  after(() => log('empty after'))
})

describe('hooks and tests that do not run', () => {
  before(() => log('skips before'))
  after(() => log('skips after'))
  beforeEach((t) => log(`skips beforeEach ${t.name}`))
  afterEach((t) => log(`skips afterEach ${t.name}`))
  it.skip('skipped', () => log('NOT RUN skipped'))
  it.todo('todo without fn')
  it.todo('todo with fn', () => log('todo with fn'))
  it('skipped in beforeEach', () => log('skipped in beforeEach still runs'))
})

describe('only skipped tests', () => {
  before(() => log('only skipped before'))
  after(() => log('only skipped after'))
  it.skip('skipped', () => log('NOT RUN only skipped'))
})

describe('skip in a beforeEach', () => {
  beforeEach((t) => t.skip('from the hook'))
  afterEach(() => log('afterEach after a skip in beforeEach'))
  it('runs but is reported as skipped', () => log('skip in beforeEach runs'))
})

describe('hooks are async', () => {
  before(async () => {
    await Promise.resolve()
    log('async before')
  })
  beforeEach(async () => {
    await Promise.resolve()
    log('async beforeEach')
  })
  afterEach(() => Promise.resolve().then(() => log('async afterEach')))
  after(() => Promise.resolve().then(() => log('async after')))
  it('after async hooks', () => log('after async hooks'))
})

test('last top level', () => log('last top level'))
log('end of file')
