/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/**
 * What runs while the `concurrency` option has several tests running at once.
 * With async context, in Node.js and workerd, it's known. In browsers it's only
 * known for the code that runs before the first `await` of a test.
 */
import {
  beforeEach,
  describe,
  getTestContext,
  it,
  test,
} from '../../src/node/test.ts'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

const timeout = 5000

function gate() {
  /** @type {() => void} */
  let open = () => {
    // set below
  }
  const opened = new Promise((resolve) => {
    open = () => resolve(undefined)
  })
  return { open, opened }
}

const name = () => getTestContext()?.name ?? 'unknown'

/**
 * @param {() => unknown} fn
 */
function attempt(fn) {
  try {
    fn()
    return 'works'
  } catch (err) {
    return /** @type {Error} */ (err).message
  }
}

describe('getTestContext', { concurrency: true }, () => {
  const started = gate()
  const resumed = gate()
  const logged = gate()

  it('first', { timeout }, async () => {
    log(`first before await: ${name()}`)
    started.open()
    await resumed.opened
    log(`first after await: ${name()}`)
    log(
      `test() in first: ${attempt(() => test('inside first', () => undefined))}`
    )
    logged.open()
  })

  it('second', { timeout }, async () => {
    await started.opened
    log(`second after await: ${name()}`)
    resumed.open()
    await logged.opened
  })
})

test('one again', async () => {
  await Promise.resolve()
  log(`one at a time: ${name()}`)
})

describe('an unhandled rejection', { concurrency: true }, () => {
  const started = gate()

  it('rejects', { timeout }, async () => {
    await started.opened
    Promise.reject(new Error('unhandled'))
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  it('runs with it', { timeout }, async () => {
    started.open()
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
})

describe('a beforeEach hook that fails', { concurrency: true }, () => {
  beforeEach((t) => {
    if (t.name === 'throws right away') {
      throw new Error('beforeEach fails')
    }
    if (t.name === 'throws later') {
      return new Promise((_, reject) =>
        setTimeout(() => reject(new Error('beforeEach fails later')), 10)
      )
    }
    return new Promise((resolve) => setTimeout(resolve, 40))
  })

  it('throws right away', () => log('NOT RUN throws right away'))
  it('throws later', () => log('NOT RUN throws later'))
  it('only fails its own test', () => log('the other test runs'))
})

describe('while a suite is built', { concurrency: true }, () => {
  const building = gate()
  const checked = gate()

  it('builds a suite', { timeout }, async () => {
    await describe('built in a test', async () => {
      building.open()
      await checked.opened
      it('inside the built suite', () => undefined)
    })
  })

  it('runs while it is built', { timeout }, async () => {
    await building.opened
    log(`while a suite is built: ${name()}`)
    checked.open()
  })
})

// Declared outside of any test, it runs while two tests do
const declare = gate()
declare.opened.then(() => {
  log(
    `test() outside of a test: ${attempt(() => test('declared outside of a test', () => undefined))}`
  )
})

describe('code outside of the tests', { concurrency: true }, () => {
  const started = gate()
  const declared = gate()

  it('opens', { timeout }, async () => {
    started.open()
    declare.open()
    await new Promise((resolve) => setTimeout(resolve, 20))
    declared.open()
  })

  it('runs with it', { timeout }, async () => {
    await started.opened
    await declared.opened
  })
})

describe('an unhandled rejection while a suite is built', {
  concurrency: true,
}, () => {
  const building = gate()
  const rejected = gate()

  // So only the test runner reports it
  globalThis.addEventListener?.('unhandledrejection', (event) =>
    event.preventDefault()
  )

  it('builds a todo suite', { timeout }, async () => {
    await describe('a todo suite', { todo: true }, async () => {
      building.open()
      await rejected.opened
      await new Promise((resolve) => setTimeout(resolve, 50))
      it('inside the todo suite', () => undefined)
    })
  })

  it('rejects while it is built', { timeout }, async () => {
    await building.opened
    Promise.reject(new Error('unhandled while built'))
    rejected.open()
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
})
