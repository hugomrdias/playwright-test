import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

describe('stdout / stderr', () => {
  it('does not add line breaks', async () => {
    const proc = await runCli(['mocks/none/stdout.test.js', '--runner', 'none'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('hello world!'), 'process stdout')
  })

  it('works in worker', async () => {
    const proc = await runCli([
      'mocks/none/stdout.test.js',
      '--runner',
      'none',
      '--mode',
      'worker',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('hello world!'), 'process stdout')
  })

  it('prints to stderr', async () => {
    const proc = await runCli(['mocks/none/stderr.test.js', '--runner', 'none'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('hello '), 'process stdout')
    ok(proc.stderr.includes('world!'), 'process stdout')
  })

  it('prints to stderr in worker', async () => {
    const proc = await runCli([
      'mocks/none/stderr.test.js',
      '--runner',
      'none',
      '--mode',
      'worker',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('hello '), 'process stdout')
    ok(proc.stderr.includes('world!'), 'process stdout')
  })
})

describe('process in the browser', () => {
  for (const mode of ['main', 'worker']) {
    it(`has what bundles expect with mode:${mode}`, async () => {
      const proc = await runCli([
        'mocks/none/process.test.js',
        '--runner',
        'none',
        '--mode',
        mode,
      ])

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('process is fine'), 'stdout')
    })

    it(`resolves every import to the global with mode:${mode}`, async () => {
      const proc = await runCli([
        'mocks/none/process-imports.test.js',
        '--runner',
        'none',
        '--mode',
        mode,
      ])

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('imports are fine'), 'stdout')
    })
  }
})

for (const browser of ['chromium', 'firefox']) {
  // Firefox is where the messages arrive late
  describe(`console output when the run ends in ${browser}`, () => {
    const timeout = 120_000

    /**
     * @param {string} fixture
     * @param {string} mode
     * @param {Record<string, string>} [env]
     */
    function run(fixture, mode, env) {
      return runCli(
        [
          `mocks/none/${fixture}.test.js`,
          '--runner',
          'none',
          '--mode',
          mode,
          '--browser',
          browser,
        ],
        // The test timeout fails the test but leaves a stuck child running
        { env, timeout: 100_000 }
      )
    }

    /**
     * @param {string} output
     * @param {string} prefix
     */
    function linesWith(output, prefix) {
      return output.split('\n').filter((line) => line.includes(prefix))
    }

    for (const mode of ['worker', 'main']) {
      it(`prints every line to stdout with mode:${mode}`, {
        timeout,
      }, async () => {
        const total = 1000
        const proc = await run('console-flood', mode)

        is(proc.exitCode, 0, 'exit code')
        const lines = linesWith(proc.stdout, 'console-flood-')
        is(lines.length, total, 'lines on stdout')
        ok(
          lines.every((line, i) => line === `console-flood-${i}`),
          'lines in order'
        )
        is(
          linesWith(proc.stderr, 'console-flood-').length,
          0,
          'lines on stderr'
        )
      })
    }

    it('waits for arguments still being read', { timeout }, async () => {
      const proc = await run('console-slow-args', 'worker')

      is(proc.exitCode, 0, 'exit code')
      const lines = linesWith(proc.stdout, 'console-slow-')
      is(lines.length, 10, 'lines on stdout')
      ok(!proc.stdout.includes('undefined'), 'arguments were read')
      is(linesWith(proc.stderr, 'console-slow-').length, 0, 'lines on stderr')
    })

    it('does not wait forever for a stuck page', { timeout }, async () => {
      // It always uses up the whole wait for the console
      const proc = await run('console-stuck', 'worker', {
        PW_TEST_CONSOLE_FLUSH_TIMEOUT: '500',
      })

      is(proc.exitCode, 0, 'exit code')
      ok(proc.stderr.includes('Timed out waiting'), 'warns about the timeout')
      is(linesWith(proc.stderr, 'console-stuck').length, 0, 'line on stderr')
      // Others can take longer to close a stuck page than the exit hook waits
      if (browser === 'chromium') {
        is(linesWith(proc.stdout, 'console-stuck').length, 1, 'line on stdout')
      }
    })
  })
}
