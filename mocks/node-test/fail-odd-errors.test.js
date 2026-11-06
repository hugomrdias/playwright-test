/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { test } from '../../src/node/test.js'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

/**
 * @param {string} message
 * @param {string} stack
 */
function withStack(message, stack) {
  const error = new Error(message)
  error.stack = stack
  return error
}

test('custom inspect throws', () => {
  const error = new Error('shown without its inspector')
  Object.assign(error, {
    [Symbol.for('nodejs.util.inspect.custom')]() {
      throw new Error('inspector throws')
    },
  })
  throw error
})

test('stack getter throws', () => {
  const error = new Error('shown without its stack')
  Object.defineProperty(error, 'stack', {
    get() {
      throw new Error('stack throws')
    },
  })
  throw error
})

test('message in the name of a frame', () => {
  throw withStack('in-a-frame', 'in-a-frame@http://localhost/test.js:5:6')
})

test('empty message', () => {
  throw withStack('', 'fn@http://localhost/test.js:5:6')
})

test('@ in the message of a stack without frames', () => {
  throw withStack('me@example.com', 'Error: me@example.com')
})

test('scoped package in a frame', () => {
  throw withStack(
    'scoped',
    'fn@http://localhost/node_modules/@scope/pkg/a.js:5:6\nmap@[native code]\n@http://localhost/b.js:7:8'
  )
})

test('diagnostic that can not be a string', (t) => {
  t.diagnostic(/** @type {any} */ (Symbol('a symbol')))
})

test(
  Object.defineProperty(
    () => {
      // noop
    },
    'name',
    { value: Symbol('not a string') }
  )
)

test('runs after', () => log('runs after'))
