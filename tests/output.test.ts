import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runTest, TEST_CONCURRENCY } from './helpers.ts'

describe('stdout / stderr', { concurrency: TEST_CONCURRENCY }, () => {
  for (const mode of ['browser', 'web-worker']) {
    it(`does not add line breaks with mode:${mode}`, async () => {
      const proc = await runTest([
        'mocks/none/stdout.test.js',
        '--runner',
        'none',
        '--mode',
        mode,
      ])

      is(proc.exitCode, 0, 'exit code')
      ok(proc.stdout.includes('hello world!'), proc.stdout)
    })

    it(`prints to stderr with mode:${mode}`, async () => {
      const proc = await runTest([
        'mocks/none/stderr.test.js',
        '--runner',
        'none',
        '--mode',
        mode,
      ])

      is(proc.exitCode, 0, 'exit code')
      ok(proc.stdout.includes('hello '), proc.stdout)
      ok(proc.stderr.includes('world!'), proc.stderr)
    })
  }
})

describe('process in the browser', { concurrency: TEST_CONCURRENCY }, () => {
  for (const mode of ['browser', 'web-worker']) {
    it(`has what bundles expect with mode:${mode}`, async () => {
      const proc = await runTest([
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
      const proc = await runTest([
        'mocks/none/process-imports.test.js',
        '--runner',
        'none',
        '--mode',
        mode,
      ])

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('imports are fine'), 'stdout')
    })

    for (const [exitCase, expectedCode] of [
      ['set-no-arg', 1],
      ['set-undefined', 0],
      ['set-zero', 0],
      ['unset-no-arg', 0],
    ]) {
      it(`uses process.exitCode for process.exit (${exitCase}) with mode:${mode}`, async () => {
        const proc = await runTest(
          [
            'mocks/none/process-exit-code.test.js',
            '--runner',
            'none',
            '--mode',
            mode,
          ],
          {
            env: { PW_TEST_EXIT_CASE: exitCase as string },
            reject: false,
          }
        )

        is(proc.exitCode, expectedCode, proc.stderr)
      })
    }
  }
})

describe('util.debuglog in the browser', () => {
  for (const mode of ['browser', 'web-worker']) {
    it(`matches NODE_DEBUG wildcards case-insensitively with mode:${mode}`, async () => {
      const proc = await runTest(
        [
          'mocks/none/util-debuglog.test.js',
          '--runner',
          'none',
          '--mode',
          mode,
        ],
        {
          env: { NODE_DEBUG: 'app*,a.b' },
          reject: false,
        }
      )

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('debuglog is fine'), 'stdout')
      ok(proc.stderr.includes('APP-HTTP: hello 1'), proc.stderr)
      ok(!proc.stderr.includes('should not print'), proc.stderr)
    })
  }
})

describe('path in the browser', { concurrency: TEST_CONCURRENCY }, () => {
  for (const mode of ['browser', 'web-worker']) {
    it(`resolves every import to the same module with mode:${mode}`, async () => {
      const proc = await runTest([
        'mocks/none/path-imports.test.js',
        '--runner',
        'none',
        '--mode',
        mode,
      ])

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('imports are fine'), 'stdout')
    })
  }

  it('resolves in a service worker', async () => {
    const proc = await runTest([
      'mocks/none/stdout.test.js',
      '--runner',
      'none',
      '--sw',
      'mocks/sw/sw-path.js',
    ])

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes('hello world!'), 'stdout')
  })
})

for (const browser of ['chromium', 'firefox']) {
  // Firefox is where the messages arrive late
  describe(`console output when the run ends in ${browser}`, {
    concurrency: TEST_CONCURRENCY,
  }, () => {
    const timeout = 120_000

    function run(
      fixture: string,
      mode: string,
      env: Record<string, string> = {}
    ) {
      return runTest(
        [
          `mocks/none/${fixture}.test.js`,
          '--runner',
          'none',
          '--mode',
          mode,
          '--browser',
          browser,
        ],
        // Not undefined, it would replace the env from the helpers.
        // The test timeout fails the test but leaves a stuck child running
        { env, timeout: 100_000 }
      )
    }

    function linesWith(output: string, prefix: string) {
      return output.split('\n').filter((line) => line.includes(prefix))
    }

    for (const mode of ['web-worker', 'browser']) {
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
      const proc = await run('console-slow-args', 'web-worker')

      is(proc.exitCode, 0, 'exit code')
      const lines = linesWith(proc.stdout, 'console-slow-')
      is(lines.length, 10, 'lines on stdout')
      ok(!proc.stdout.includes('undefined'), 'arguments were read')
      is(linesWith(proc.stderr, 'console-slow-').length, 0, 'lines on stderr')
    })

    it('does not wait forever for a stuck page', { timeout }, async () => {
      // It always uses up the whole wait for the console
      const proc = await run('console-stuck', 'web-worker', {
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
