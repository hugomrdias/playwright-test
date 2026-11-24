import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli, TEST_CONCURRENCY } from './helpers.ts'

describe('mocha', { concurrency: TEST_CONCURRENCY }, () => {
  it('runs with --runner mocha', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--runner', 'mocha'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('fixtures', async () => {
    const proc = await runCli(['mocks/fixtures.mocha.js', '--runner', 'mocha'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('with DEBUG=app', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--runner', 'mocha'], {
      env: { DEBUG: 'app' },
    })

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
    ok(proc.stdout.includes('app test pass'), 'debug output')
  })

  it('mode:web-worker', async () => {
    const proc = await runCli([
      'mocks/test.mocha.js',
      '--runner',
      'mocha',
      '--mode',
      'web-worker',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  // Function configs are in config.test.ts
  for (const config of ['sw.config.cjs', 'sw.promise.config.mjs']) {
    it(`--sw from ${config}`, async () => {
      const proc = await runCli([
        'mocks/sw/sw-test.js',
        '--runner',
        'mocha',
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
