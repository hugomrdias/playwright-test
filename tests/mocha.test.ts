import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli, TEST_CONCURRENCY } from './helpers.ts'

describe('mocha', { concurrency: TEST_CONCURRENCY }, () => {
  it('is autodetected', async () => {
    const proc = await runCli(['mocks/test.mocha.js'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
    ok(proc.stderr.includes('Autodetected "mocha" as the runner'), proc.stderr)
  })

  it('fixtures', async () => {
    const proc = await runCli(['mocks/fixtures.mocha.js', '--runner', 'mocha'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('with DEBUG=app', async () => {
    const proc = await runCli(['mocks/test.mocha.js'], {
      env: { DEBUG: 'app' },
    })

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
    ok(proc.stdout.includes('app test pass'), 'debug output')
  })

  it('mode:worker', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--mode', 'worker'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('mocha extension', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--extension'])
    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  // Function configs are in config.test.ts
  for (const config of ['sw.config.cjs', 'sw.promise.config.mjs']) {
    it(`--sw from ${config}`, async () => {
      const proc = await runCli([
        'mocks/sw/sw-test.js',
        '--sw',
        'mocks/sw/sw.js',
        '--config',
        `mocks/sw/${config}`,
      ])

      is(proc.exitCode, 0, 'exit code')
      ok(proc.stdout.includes('1 passing'), 'process stdout')
    })
  }
})
