import { describe, it } from 'node:test'
import { execa } from 'execa'
import { equal, is, ok } from 'uvu/assert'
import { runnerOptions } from '../src/utils/index.js'

describe('run timeout', () => {
  /**
   * @param {string} fixture
   * @param {string[]} args
   */
  function run(fixture, args) {
    return execa(
      './cli.js',
      [`mocks/none/${fixture}.test.js`, '--runner', 'none', ...args],
      // Fail here when the run timeout doesn't work, instead of hanging
      { reject: false, timeout: 40_000 }
    )
  }

  for (const mode of ['main', 'worker', 'node']) {
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

  // On Windows a killed process can't run any cleanup
  it('stops the tests when it gets stopped', {
    skip: process.platform === 'win32',
  }, async () => {
    const running = run('never-ends', ['--mode', 'node'])
    await new Promise((resolve) => setTimeout(resolve, 1500))
    running.kill()

    // Tests still running keep stdout open, and this waits for it
    const proc = await running
    is(proc.timedOut, false, 'ended by itself')
  })

  it('fails a test that never ends with coverage', async () => {
    const proc = await run('never-ends', [
      '--mode',
      'node',
      '--cov',
      '--report-dir',
      '.coverage',
      '--run-timeout',
      '1000',
    ])

    is(proc.timedOut, false, 'ended by itself')
    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Run timed out after 1000ms'), proc.stderr)
  })

  for (const mode of ['main', 'node']) {
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

  for (const value of ['soon', '-1', '1.5', '2147483648']) {
    it(`rejects ${value}`, async () => {
      const proc = await run('stdout', [`--run-timeout=${value}`])

      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes('Invalid run timeout'), proc.stderr)
    })
  }

  it('is not forwarded to the runner, unlike their own --timeout', () => {
    equal(runnerOptions({ 'run-timeout': 1000, timeout: 5000 }), {
      timeout: 5000,
    })
  })
})
