/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/**
 * The `concurrency` option. Tests that run at the same time wait for each
 * other, so the log only depends on what they wait for: run one after the
 * other they would time out.
 */
import {
  afterEach,
  beforeEach,
  describe,
  it,
  test,
} from '../../src/node/test.ts'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

/** Long enough for slow CI, short enough to fail a run that waits forever */
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

/**
 * Tracks how many run at once.
 */
function counter() {
  let active = 0
  let max = 0
  return {
    enter() {
      active++
      max = Math.max(max, active)
    },
    leave() {
      active--
    },
    get max() {
      return max
    },
  }
}

describe('two tests that wait for each other', { concurrency: true }, () => {
  const started = gate()
  const first = gate()
  const second = gate()

  it('first', { timeout }, async () => {
    log('first start')
    started.open()
    await first.opened
    log('first resumed')
    second.open()
  })

  it('second', { timeout }, async () => {
    await started.opened
    log('second start')
    first.open()
    await second.opened
    log('second resumed')
  })
})

describe('reported in the order they are declared', { concurrency: 2 }, () => {
  const done = gate()

  it('finishes last', { timeout }, async () => {
    await done.opened
    log('finishes last')
  })

  it('finishes first', () => {
    log('finishes first')
    done.open()
  })
})

describe('at most as many as the number', { concurrency: 2 }, () => {
  const running = counter()
  const started = gate()
  const other = gate()

  it('one', { timeout }, async () => {
    running.enter()
    started.open()
    await other.opened
    running.leave()
  })

  it('two', { timeout }, async () => {
    running.enter()
    await started.opened
    other.open()
    running.leave()
  })

  for (const name of ['three', 'four', 'five']) {
    it(name, async () => {
      running.enter()
      // Lets the others start, if they could
      await new Promise((resolve) => setTimeout(resolve, 20))
      running.leave()
    })
  }

  it('checks', () => log(`at most ${running.max} at once`))
})

describe('inherited', { concurrency: true }, () => {
  const started = gate()
  const other = gate()

  describe('a suite inside', () => {
    it('waits', { timeout }, async () => {
      started.open()
      await other.opened
      log('inherited waits')
    })

    it('opens', { timeout }, async () => {
      await started.opened
      log('inherited opens')
      other.open()
    })
  })
})

describe('false inside true', { concurrency: true }, () => {
  describe('one at a time', { concurrency: false }, () => {
    const running = counter()
    for (const name of ['a', 'b', 'c']) {
      it(name, async () => {
        running.enter()
        await new Promise((resolve) => setTimeout(resolve, 5))
        running.leave()
      })
    }
    it('checks', () => log(`one at a time: ${running.max}`))
  })
})

test('subtests of a test', { concurrency: true }, async (t) => {
  const started = gate()
  const other = gate()
  await Promise.all([
    t.test('waits', { timeout }, async () => {
      log('subtest waits')
      started.open()
      await other.opened
      log('subtest resumed')
    }),
    t.test('opens', { timeout }, async () => {
      await started.opened
      log('subtest opens')
      other.open()
    }),
  ])
  log('subtests done')
})

describe('hooks run around each', { concurrency: true }, () => {
  const started = gate()
  const other = gate()

  beforeEach((t) => log(`beforeEach ${t.name}`))
  afterEach((t) => log(`afterEach ${t.name}`))

  it('hooked first', { timeout }, async () => {
    started.open()
    await other.opened
  })

  it('hooked second', { timeout }, async () => {
    await started.opened
    other.open()
  })
})

describe('a failure leaves the others alone', { concurrency: true }, () => {
  const failed = gate()

  it('fails', () => {
    failed.open()
    throw new Error('fails')
  })

  it('passes after it', { timeout }, async () => {
    await failed.opened
    log('passes after the failure')
  })
})

describe('a timeout cancels what is still running', { timeout: 100 }, () => {
  test('the parent', { concurrency: true }, async (t) => {
    t.test('hangs', () => new Promise(() => undefined))
    t.test('hangs too', () => new Promise(() => undefined))
    await new Promise(() => undefined)
  })
})

test('invalid values', () => {
  for (const concurrency of [0, -1, 1.5, 2 ** 32, 2 ** 40, 'x', {}]) {
    try {
      test('never runs', { concurrency }, () => undefined)
      log(`${String(concurrency)} accepted`)
    } catch (err) {
      const { code, name, message } = /** @type {any} */ (err)
      log(`${String(concurrency)} ${name} ${code} ${message}`)
    }
  }
})
