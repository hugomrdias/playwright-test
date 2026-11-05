import { strictEqual as is, ok } from 'node:assert/strict'
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

  it('gets the cli defaults in a function', async () => {
    ok((await run(config('function'))).includes('Firefox'))
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
