const fail = (/** @type {string} */ message) => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const members = {
  title: process.title === 'browser',
  browser: process.browser === true,
  env: typeof process.env.PW_OPTIONS === 'string',
  argv: Array.isArray(process.argv),
  version: process.version === '',
  versions: typeof process.versions === 'object',
  cwd: process.cwd() === '/',
  umask: process.umask() === 0,
  listeners: Array.isArray(process.listeners('exit')),
}

for (const name of [
  'on',
  'addListener',
  'once',
  'off',
  'removeListener',
  'removeAllListeners',
  'emit',
  'prependListener',
  'prependOnceListener',
]) {
  members[name] = process[name]('exit', () => undefined) === undefined
}

for (const name of ['binding', 'chdir']) {
  try {
    process[name]('x')
    members[name] = false
  } catch (error) {
    members[name] = error.message === `process.${name} is not supported`
  }
}

for (const [name, passed] of Object.entries(members)) {
  if (!passed) {
    fail(`process.${name} is wrong`)
  }
}

const order = []

// Fake timers installed after the shim loaded don't hold up its ticks
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = () => fail('nextTick used the stubbed setTimeout')
process.nextTick(
  (a, b) => {
    order.push(a + b)
    process.nextTick(() => order.push('nested'))
  },
  'with',
  'args'
)
globalThis.setTimeout = realSetTimeout

process.nextTick(() => order.push('second'))
// Ticks run after promises, so deferred code can wait for pending imports
Promise.resolve().then(() => order.push('promise'))

setTimeout(() => {
  const actual = order.join(' ')
  if (actual !== 'promise withargs second nested') {
    fail(`nextTick ran in the wrong order: ${actual}`)
    return
  }
  process.stdout.write('process is fine\n')
  process.exit(0)
})
