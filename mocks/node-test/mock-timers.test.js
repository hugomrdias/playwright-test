/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
import { mock, test } from '../../src/node/test.ts'

const log = (/** @type {string} */ msg) => console.log(`ORDER ${msg}`)

/** @param {() => unknown} fn */
function error(fn) {
  try {
    fn()
    return 'no error'
  } catch (err) {
    const e = /** @type {{ code?: string, message: string }} */ (err)
    return `${e.code}: ${e.message}`
  }
}

test('setTimeout runs on tick', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  setTimeout((a, b) => log(`timeout 20 ${a} ${b}`), 20, 'x', 'y')
  setTimeout(() => log('timeout 10'), 10)
  const cleared = setTimeout(() => log('NOT RUN cleared'), 5)
  clearTimeout(cleared)
  setTimeout(() => {
    log('timeout 15')
    setTimeout(() => log('timeout nested 15 + 5'), 5)
  }, 15)
  setTimeout(() => log('timeout 10 again'), 10)
  log('tick 9')
  t.mock.timers.tick(9)
  log('tick 11')
  t.mock.timers.tick(11)
  log('tick 100')
  t.mock.timers.tick(100)
})

test('a timer returns a Timeout', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const timer = setTimeout(() => log('NOT RUN closed'), 1)
  log(`hasRef ${timer.hasRef()} ref ${timer.ref() === timer}`)
  log(`unref ${timer.unref() === timer} refresh ${timer.refresh() === timer}`)
  timer.close()
  t.mock.timers.tick(10)
  const disposed = setTimeout(() => log('NOT RUN disposed'), 1)
  disposed[Symbol.dispose]()
  t.mock.timers.tick(10)
})

test('setInterval repeats until cleared', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  let count = 0
  const id = setInterval(() => {
    count++
    log(`interval ${count}`)
    if (count === 3) {
      clearInterval(id)
    }
  }, 10)
  t.mock.timers.tick(25)
  t.mock.timers.tick(100)
  log(`count ${count}`)
})

test('setImmediate runs before timers of the same tick', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setImmediate'] })
  setTimeout(() => log('timeout 0'), 0)
  setImmediate((a) => log(`immediate ${a}`), 'arg')
  const cleared = setImmediate(() => log('NOT RUN cleared'))
  clearImmediate(cleared)
  t.mock.timers.tick(0)
})

test('Date', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  // biome-ignore lint/complexity/useDateNow: the constructor is what is tested
  log(`now ${Date.now()} new ${new Date().getTime()}`)
  log(`isMock ${Date.isMock} string ${typeof Date()}`)
  log(`args ${new Date(5).getTime()} utc ${Date.UTC(2000, 0)}`)
  log(`instanceof ${new Date() instanceof Date}`)
  t.mock.timers.tick(500)
  log(`after tick ${Date.now()}`)
  t.mock.timers.setTime(42)
  log(`after setTime ${Date.now()}`)
})

test('Date from a Date', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2020, 0, 1) })
  log(`year ${new Date().getFullYear()}`)
})

test('AbortSignal.timeout', (t) => {
  t.mock.timers.enable({ apis: ['AbortSignal.timeout'] })
  const signal = AbortSignal.timeout(50)
  signal.addEventListener('abort', () => log('aborted'))
  t.mock.timers.tick(49)
  log(`aborted at 49 ${signal.aborted}`)
  t.mock.timers.tick(1)
  log(`aborted at 50 ${signal.aborted} ${signal.reason.name}`)
  log(error(() => AbortSignal.timeout(-1)))
})

test('runAll', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  setTimeout(() => log(`runAll 50 at ${Date.now()}`), 50)
  setTimeout(() => log(`runAll 100 at ${Date.now()}`), 100)
  setTimeout(() => log(`runAll 3000 at ${Date.now()}`), 3000)
  t.mock.timers.runAll()
  log(`runAll done at ${Date.now()}`)
})

test('every api by default', (t) => {
  t.mock.timers.enable({ apis: undefined })
  setTimeout(() => log('default timeout'), 1)
  setInterval(() => log('NOT RUN default interval'), 10)
  setImmediate(() => log('default immediate'))
  log(`default now ${Date.now()}`)
  t.mock.timers.tick(1)
})

test('errors', (t) => {
  log(error(() => t.mock.timers.tick()))
  log(error(() => t.mock.timers.runAll()))
  log(error(() => t.mock.timers.setTime(1)))
  log(error(() => t.mock.timers.enable({ apis: ['foo'] })))
  log(error(() => t.mock.timers.enable({ apis: 'setTimeout' })))
  log(error(() => t.mock.timers.enable({ apis: [1] })))
  log(error(() => t.mock.timers.enable({ now: Number.NaN })))
  log(error(() => t.mock.timers.enable({ now: -1 })))
  log(error(() => t.mock.timers.enable({ now: '1' })))
  t.mock.timers.enable({ apis: ['setTimeout'] })
  log(error(() => t.mock.timers.enable()))
  log(error(() => t.mock.timers.tick(-1)))
  log(error(() => t.mock.timers.setTime(-1)))
  log(error(() => t.mock.timers.setTime('1')))
})

test('reset and dispose put the real timers back', async (t) => {
  const real = globalThis.setTimeout
  t.mock.timers.enable({ apis: ['setTimeout'] })
  log(`mocked ${globalThis.setTimeout !== real}`)
  t.mock.timers.reset()
  log(`reset ${globalThis.setTimeout === real}`)
  t.mock.timers.reset()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.timers[Symbol.dispose]()
  log(`disposed ${globalThis.setTimeout === real}`)
  await new Promise((resolve) => setTimeout(resolve, 1))
  log('real timer fired')
})

test('left enabled with subtests', async (t) => {
  t.mock.timers.enable()
  await t.test('a subtest', () => log('subtest runs'))
  log(`still mocked ${Date.now()}`)
})

test('the test after it has real timers', async () => {
  log(`Date is real ${!Date.isMock}`)
  await new Promise((resolve) => setTimeout(resolve, 1))
  log('real timer fired again')
})

test('the global mock', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  setTimeout(() => log('global mock timeout'), 5)
  mock.timers.tick(5)
  mock.timers.reset()
})
