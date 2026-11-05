import { strict as assert } from 'assert'
import { mock, test } from '../../src/node/test.js'

test('mock.fn', () => {
  const fn = mock.fn(
    (/** @type {number} */ a, /** @type {number} */ b) => a + b
  )
  const self = {}
  assert.equal(fn.call(self, 1, 2), 3)
  assert.equal(fn.mock.callCount(), 1)
  const [call] = fn.mock.calls
  assert.deepEqual(call.arguments, [1, 2])
  assert.equal(call.result, 3)
  assert.equal(call.error, undefined)
  assert.equal(call.this, self)
  assert.equal(call.target, undefined)
  assert.ok(call.stack instanceof Error)
})

test('mock.fn without arguments', () => {
  const fn = mock.fn()
  assert.equal(fn(), undefined)
  assert.equal(fn.mock.callCount(), 1)
})

test('mock.fn records errors', () => {
  const error = new Error('x')
  const fn = mock.fn(() => {
    throw error
  })
  assert.throws(fn, error)
  assert.equal(fn.mock.calls[0].error, error)
})

test('mock.fn original, implementation and times', () => {
  const fn = mock.fn(
    () => 'original',
    () => 'mocked',
    { times: 2 }
  )
  assert.equal(fn(), 'mocked')
  assert.equal(fn(), 'mocked')
  assert.equal(fn(), 'original')
  assert.equal(fn.mock.callCount(), 3)
})

test('mock.fn implementations', () => {
  const fn = mock.fn(() => 'original')
  fn.mock.mockImplementation(() => 'other')
  assert.equal(fn(), 'other')
  fn.mock.mockImplementationOnce(() => 'once')
  assert.equal(fn(), 'once')
  assert.equal(fn(), 'other')
  fn.mock.resetCalls()
  assert.equal(fn.mock.callCount(), 0)
  fn.mock.restore()
  assert.equal(fn(), 'original')
})

test('mock.fn with new', () => {
  class Foo {
    value = 1
  }
  const Mock = mock.fn(Foo)
  const instance = new Mock()
  assert.equal(instance.value, 1)
  assert.equal(Mock.mock.calls[0].target, Foo)
  assert.equal(Mock.mock.calls[0].result, instance)

  const Empty = mock.fn()
  new Empty()
  assert.equal(Empty.mock.callCount(), 1)
})

test('mock.method', () => {
  const object = {
    value: 2,
    double() {
      return this.value * 2
    },
  }
  const original = object.double
  const spy = mock.method(object, 'double')
  assert.equal(object.double(), 4)
  assert.equal(spy.mock.callCount(), 1)
  assert.equal(spy.mock.calls[0].this, object)

  const mocked = mock.method(object, 'double', () => 10)
  assert.equal(object.double(), 10)
  mocked.mock.restore()
  spy.mock.restore()
  assert.equal(object.double, original)
})

test('mock.method on the prototype chain, getters and setters', () => {
  class Foo {
    get value() {
      return 1
    }
    set value(_v) {
      // noop
    }
    method() {
      return 'method'
    }
  }
  const foo = new Foo()
  const method = mock.method(foo, 'method', () => 'mocked')
  assert.equal(foo.method(), 'mocked')
  method.mock.restore()

  const getter = mock.getter(foo, 'value', () => 2)
  assert.equal(foo.value, 2)
  assert.equal(getter.mock.callCount(), 1)
  getter.mock.restore()

  const setter = mock.method(Foo.prototype, 'value', { setter: true })
  new Foo().value = 3
  assert.equal(setter.mock.callCount(), 1)
  assert.deepEqual(setter.mock.calls[0].arguments, [3])
  setter.mock.restore()
})

test('mock.method errors', () => {
  assert.throws(() => mock.method({ a: 1 }, 'a'))
  assert.throws(() => mock.method({}, 'missing'))
})

test('mock.property', () => {
  const object = { value: 1 }
  const mocked = mock.property(object, 'value', 2)
  assert.equal(object.value, 2)
  assert.equal(mocked.mock.accessCount(), 1)
  object.value = 3
  assert.equal(object.value, 3)
  mocked.mock.restore()
  assert.equal(object.value, 1)
})

test('mock.restoreAll and mock.reset', () => {
  const object = {
    method() {
      return 'original'
    },
  }
  mock.method(object, 'method', () => 'mocked')
  assert.equal(object.method(), 'mocked')
  mock.restoreAll()
  assert.equal(object.method(), 'original')
  mock.method(object, 'method', () => 'mocked')
  mock.reset()
  assert.equal(object.method(), 'original')
})

const object = {
  method() {
    return 'original'
  },
}

test('t.mock restores at the end of the test', (t) => {
  t.mock.method(object, 'method', () => 'mocked')
  assert.equal(object.method(), 'mocked')
})

test('t.mock was restored', () => {
  assert.equal(object.method(), 'original')
})
