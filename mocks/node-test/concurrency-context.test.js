/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/**
 * What runs while the `concurrency` option has several tests running at once.
 * With async context, in Node.js and workerd, it's known. In browsers it's only
 * known for the code that runs before the first `await` of a test.
 */
import { describe, getTestContext, it, test } from '../../src/node/test.ts'

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
