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

for (const browser of ['chromium', 'firefox']) {
  // Firefox is where the messages arrive late
  describe(`console output when the run ends in ${browser}`, () => {
    const timeout = 120_000

    /**
     * @param {string} fixture
     * @param {string} mode
     */
    function run(fixture, mode) {
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
        { timeout: 100_000 }
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
        const total = 10_000
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
      is(lines.length, 50, 'lines on stdout')
      ok(!proc.stdout.includes('undefined'), 'arguments were read')
      is(linesWith(proc.stderr, 'console-slow-').length, 0, 'lines on stderr')
    })

    it('does not wait forever for a stuck page', { timeout }, async () => {
      const proc = await run('console-stuck', 'worker')

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
