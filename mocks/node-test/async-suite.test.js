/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import {
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  test,
} from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)
const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

describe('async body', async () => {
  it('before the await', (t) => log(t.fullName))
  await tick()
  before(() => log('hook after the await'))
  beforeEach(() => log('beforeEach after the await'))
  afterEach(() => log('afterEach after the await'))
  it('after the await', (t) => log(t.fullName))
  describe('sync suite after the await', () => {
    it('sync nested', (t) => log(t.fullName))
  })
  await describe('async suite after the await', async () => {
    await tick()
    it('async nested', (t) => log(t.fullName))
  })
  it('last', (t) => log(t.fullName))
})

test('after the async suite', (t) => log(t.fullName))

describe('second async body', async () => {
  await tick()
  it('second', (t) => log(t.fullName))
})

describe('sync after async', () => {
  it('sync', (t) => log(t.fullName))
})
