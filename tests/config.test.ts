import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
  rejects,
} from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { CliOptions } from '../src/types.ts'
import { UsageError } from '../src/utils/index.ts'
import { resolveCli, runCli, TEST_CONCURRENCY } from './helpers.ts'

/** What the config functions in the fixtures leave behind */
const fixtureGlobals = globalThis as typeof globalThis & {
  receivedCliOptions?: CliOptions
  configCalled?: boolean
}

async function run(args: string[]) {
  const proc = await runCli(
    ['mocks/config/where.js', '--runner', 'none', ...args],
    { reject: false }
  )
  is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
  return proc.stdout
}

async function resolve(args: string[]) {
  const { options } = await resolveCli([
    'mocks/config/where.js',
    '--runner',
    'none',
    ...args,
  ])
  return options
}

const config = (name: string) => ['--config', `mocks/config/${name}.config.js`]

const fixture = 'mocks/runner-options/mocha.js'

describe('config file', () => {
  let dir: string
  let count = 0

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-cfg-'))
  })
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  /**
   * A config file of its own, imports are cached.
   */
  const write = (source: string) => {
    const file = path.join(dir, `${count++}.config.mjs`)
    fs.writeFileSync(file, source)
    return file
  }

  it('uses browser', async () => {
    is((await resolve(config('firefox'))).browser, 'firefox')
  })

  it('uses mode web-worker', async () => {
    is((await resolve(config('web-worker'))).mode, 'web-worker')
  })

  it('uses mode node', async () => {
    is((await resolve(config('node'))).mode, 'node')
  })

  it('loses to flags', async () => {
    is(
      (await resolve([...config('firefox'), '--browser', 'chromium'])).browser,
      'chromium'
    )
    is(
      (await resolve([...config('node'), '--mode', 'browser'])).mode,
      'browser'
    )
  })

  it('gets the cli defaults in a function', async () => {
    is((await resolve(config('function'))).browser, 'firefox')
  })

  it('passes normalized camelCase CliOptions to a config function', async () => {
    const file = write(`export default function config(cli) {
  globalThis.receivedCliOptions = cli
  return {
    mode: 'browser',
    testNamePattern: 'beta',
  }
}
`)

    const { options, logs } = await resolveCli([
      fixture,
      '--config',
      file,
      '--mode',
      'node',
      '--test-name-pattern',
      'alpha two',
      '--test-timeout',
      '1500',
      '--run-timeout',
      '15000',
    ])

    const received = fixtureGlobals.receivedCliOptions
    ok(received, 'the config function was called')
    is(received.runner, undefined)
    is(received.assets, undefined)
    is(received.mode, 'node')
    is(received.runTimeout, 15000)
    is(received.testNamePattern, 'alpha two')
    is(received.testTimeout, 1500)
    equal(
      Object.keys(received).filter((k) => k.includes('-')),
      []
    )
    // CLI flags beat the values returned by the config function
    is(options.mode, 'node')
    is(options.testNamePattern, 'alpha two')
    // Runner autodetection runs when neither CLI nor config sets runner
    is(options.runner, 'mocha')
    ok(logs.includes('Autodetected "mocha"'), logs)
  })

  it('validates explicit CLI test flags before calling a config function', async () => {
    const file = write(`export default function config(cli) {
  globalThis.configCalled = true
  return {}
}
`)

    // Each message is in cli-options.test.ts
    const cases: [string[], string][] = [
      [['--test-timeout'], 'must be a number'],
      [['--test-name-pattern'], 'non-empty pattern'],
      [['--run-timeout=soon'], 'Invalid run timeout'],
    ]

    for (const [args, message] of cases) {
      await rejects(
        resolveCli([fixture, '--config', file, '--mode', 'node', ...args]),
        (error: Error) =>
          error instanceof UsageError && error.message.includes(message),
        args.join(' ')
      )
      is(fixtureGlobals.configCalled, undefined)
    }
  })

  it('validates invalid test options returned by a config function', async () => {
    const file = write(`export default function config() {
  return { testTimeout: 1.5 }
}
`)

    await rejects(
      resolveCli([fixture, '--config', file, '--mode', 'node']),
      (error: Error) =>
        error instanceof UsageError &&
        error.message.includes('must be a number')
    )
  })

  it('gives the test name pattern, and the cli wins', async () => {
    const args = [
      fixture,
      '--runner',
      'mocha',
      '--config',
      'mocks/runner-options/pattern.config.js',
    ]

    is((await resolveCli(args)).options.testNamePattern, 'beta')
    is(
      (await resolveCli([...args, '--test-name-pattern', 'alpha two'])).options
        .testNamePattern,
      'alpha two'
    )
  })
})

describe('config file in the browser', {
  concurrency: TEST_CONCURRENCY,
}, () => {
  it('passes launchOptions to the browser', async () => {
    const stdout = await run(config('launch-args'))
    ok(stdout.includes('agent: pw-test-launch-options'), stdout)
  })

  it('launches launchOptions.executablePath', async () => {
    const stdout = await run(config('launch-exe'))
    ok(stdout.includes('HeadlessChrome'), stdout)
  })
})

describe('without a config file', () => {
  it('uses the defaults', async () => {
    const stdout = await run([])
    ok(stdout.includes('document: object'), stdout)
    ok(stdout.includes('Chrome'), stdout)
  })
})
