import { suite, assert, test as _test } from '../../src/taps/index.js'
import delay from 'delay'

let test = suite('test3').skip

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
    assert.type(() => {}, 'function')
  },
  { timeout: 100 }
)
