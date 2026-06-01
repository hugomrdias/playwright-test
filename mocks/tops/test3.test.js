/** biome-ignore-all lint/suspicious/noConsole: its ok */
import delay from 'delay'
import { assert, suite } from '../../src/taps/index.js'

const test = suite('test3').skip

test.before(() => {
  console.log('before')
})

test('test assert', () => {
  assert.match('foo', /foo/)
  assert.doesNotMatch('fiii', /foo/)
  assert.equal(3, 32)

  assert.type('ssss', 'string')
  assert.instance(new Date(), Date)
})

test(
  'test timeout',
  async () => {
    await delay(200)
    // biome-ignore lint/suspicious/noEmptyBlockStatements: its ok
    assert.type(() => {}, 'function')
  },
  { timeout: 100 }
)
