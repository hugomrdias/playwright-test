import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

/**
 * @param {string[]} args
 */
async function run(args) {
  const proc = await runCli(
    ['mocks/config/where.js', '--runner', 'none', ...args],
    { reject: false }
  )
  is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
  return proc.stdout
}

const config = (/** @type {string} */ name) => [
  '--config',
  `mocks/config/${name}.config.js`,
]

describe('config file', () => {
  it('uses browser', async () => {
    ok((await run(config('firefox'))).includes('Firefox'))
  })

  it('uses mode worker', async () => {
    ok((await run(config('worker'))).includes('document: undefined'))
  })

  it('uses mode node', async () => {
    ok((await run(config('node'))).includes('node: string'))
  })

  it('loses to flags', async () => {
    const browser = await run([...config('firefox'), '--browser', 'chromium'])
    ok(!browser.includes('Firefox'), browser)

    const mode = await run([...config('node'), '--mode', 'main'])
    ok(mode.includes('document: object'), mode)
  })

  for (const args of [[], ['--incognito']]) {
    it(`passes launchOptions to the browser ${args.join(' ')}`, async () => {
      const stdout = await run([...config('launch-args'), ...args])
      ok(stdout.includes('agent: pw-test-launch-options'), stdout)
    })
  }

  it('launches launchOptions.executablePath', async () => {
    const stdout = await run(config('launch-exe'))
    ok(stdout.includes('HeadlessChrome'), stdout)
  })

  it('gets the cli defaults in a function', async () => {
    ok((await run(config('function'))).includes('Firefox'))
  })

  it('passes normalized camelCase CliOptions to a config function', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-cfg-'))
    const outFile = path.join(dir, 'cli-opts.json')
    const cfgFile = path.join(dir, 'pw.config.mjs')
    try {
      fs.writeFileSync(
        cfgFile,
        `import fs from 'node:fs'
export default function config(cli) {
  fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({
    keys: Object.keys(cli).sort(),
    runner: cli.runner,
    assets: cli.assets,
    mode: cli.mode,
    runTimeout: cli.runTimeout,
    testNamePattern: cli.testNamePattern,
    testTimeout: cli.testTimeout,
    hasKebab: 'test-name-pattern' in cli || 'test-timeout' in cli || 'run-timeout' in cli,
  }))
  return {
    mode: 'main',
    testNamePattern: 'beta',
  }
}
`
      )

      const proc = await runCli(
        [
          'mocks/runner-options/mocha.js',
          '--config',
          cfgFile,
          '--mode',
          'node',
          '--test-name-pattern',
          'alpha two',
          '--test-timeout',
          '1500',
          '--run-timeout',
          '15000',
        ],
        { reject: false }
      )

      is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
      const received = JSON.parse(fs.readFileSync(outFile, 'utf8'))
      is(received.hasKebab, false)
      is(received.runner, undefined)
      is(received.assets, undefined)
      is(received.mode, 'node')
      is(received.runTimeout, 15000)
      is(received.testNamePattern, 'alpha two')
      is(received.testTimeout, 1500)
      equal(
        received.keys.filter((/** @type {string} */ k) => k.includes('-')),
        []
      )
      // CLI flags beat the values returned by the config function
      ok(proc.stdout.includes('alpha two'), proc.stdout)
      ok(!proc.stdout.includes('beta'), proc.stdout)
      // Runner autodetection runs when neither CLI nor config sets runner
      ok(proc.stderr.includes('Autodetected "mocha"'), proc.stderr)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('without a config file', () => {
  it('uses the defaults', async () => {
    const stdout = await run([])
    ok(stdout.includes('document: object'), stdout)
    ok(stdout.includes('Chrome'), stdout)
  })

  it('keeps files after boolean flags', async () => {
    const proc = await runCli(
      ['--incognito', 'mocks/config/where.js', '--runner', 'none'],
      { reject: false }
    )
    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes('document: object'), proc.stdout)
  })
})
