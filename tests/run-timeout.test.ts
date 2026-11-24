import { strictEqual as is, ok } from 'node:assert/strict'
import { once } from 'node:events'
import { describe, it } from 'node:test'
import { runCli, runTest, TEST_CONCURRENCY } from './helpers.ts'

describe('run timeout', { concurrency: TEST_CONCURRENCY }, () => {
  function run(fixture: string, args: string[], env = {}) {
    return runTest(
      [`mocks/none/${fixture}.test.js`, '--runner', 'none', ...args],
      {
        // A page that never ends always uses up the whole wait for its console
        env: { PW_TEST_CONSOLE_FLUSH_TIMEOUT: '500', ...env },
        // Fail here when the run timeout doesn't work, instead of hanging
        reject: false,
        timeout: 40_000,
      }
    )
  }

  function runProcess(fixture: string, args: string[], env = {}) {
    return runCli(
      [`mocks/none/${fixture}.test.js`, '--runner', 'none', ...args],
      {
        env: { PW_TEST_CONSOLE_FLUSH_TIMEOUT: '500', ...env },
        reject: false,
        timeout: 40_000,
      }
    )
  }

  for (const mode of ['browser', 'web-worker', 'node']) {
    it(`fails a test that never ends with mode:${mode}`, async () => {
      const proc = await run('never-ends', [
        '--mode',
        mode,
        '--run-timeout',
        '1000',
      ])

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes('Run timed out after 1000ms'), proc.stderr)
    })
  }

  it('closes the browser before the afterTests hook', {
    skip: process.platform === 'win32',
  }, async () => {
    const proc = await runProcess(
      'never-ends',
      [
        '--config',
        'mocks/flow/after-browser.config.mjs',
        '--run-timeout',
        '1000',
      ],
      // The page that never ends keeps a core busy, and the other tests here
      // run pages like it at the same time. On the macOS runners Chromium can
      // then take longer than the default 5s to close.
      { PW_TEST_EXIT_WAIT: '15000' }
    )

    is(proc.exitCode, 1, proc.stderr)
    ok(proc.stderr.includes('Run timed out after 1000ms'), proc.stderr)
    ok(proc.stdout.includes('browser-closed'), proc.stdout)
  })

  // On Windows a killed process can't run any cleanup
  it('stops the tests when it gets stopped', {
    skip: process.platform === 'win32',
  }, async () => {
    const running = runProcess('never-ends', ['--mode', 'node'])
    // The fixture prints this right before it gets stuck
    await once(running.stdout, 'data')
    running.kill()

    // Tests still running keep stdout open, and this waits for it
    const proc = await running
    is(proc.timedOut, false, 'ended by itself')
  })

  for (const mode of ['browser', 'node']) {
    it(`leaves a run that ends in time alone with mode:${mode}`, async () => {
      const proc = await run('stdout', [
        '--mode',
        mode,
        '--run-timeout',
        '30000',
      ])

      is(proc.exitCode, 0, 'exit code')
      ok(!proc.stderr.includes('timed out'), proc.stderr)
    })

    it(`0 turns it off with mode:${mode}`, async () => {
      const proc = await run('stdout', ['--mode', mode, '--run-timeout', '0'])

      is(proc.exitCode, 0, 'exit code')
      ok(!proc.stderr.includes('timed out'), proc.stderr)
    })
  }
})
