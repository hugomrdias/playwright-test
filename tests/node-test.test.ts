import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { pathToFileURL } from 'url'
import { execa, runCli, TEST_CONCURRENCY } from './helpers.ts'

describe('playwright-test/node-test', () => {
  // With process isolation node mode runs the real node:test, the files here
  // test playwright-test/node-test
  const runner = ['--runner', 'node-test', '--test-isolation', 'none']
  const modes = ['node', 'browser', 'web-worker']

  /** A test in the output: its symbol, name and what's after `#`. */
  const STATUS = /^\s*(✔|✖|﹣|⚠) (.*) \(\d+(?:\.\d+)?ms\)(?: # (.*))?$/

  const fixture = (name: string) => `mocks/node-test/${name}.test.js`

  /**
   * The value of a line of the summary.
   */
  const summary = (text: string, label: string) =>
    Number(
      lines(text)
        .find((l) => l.startsWith(`ℹ ${label} `))
        ?.split(' ')[2]
    )

  const lines = (text: string) =>
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ansi colors
    text.replaceAll(/\u001B\[[0-9;]*m/g, '').split('\n')

  const apiCache: Map<string, ReturnType<typeof execApi>> = new Map()

  /**
   * Run a fixture with this API, and read what it reported.
   */
  async function execApi(name: string, mode: string) {
    const proc = await runCli([fixture(name), ...runner, '--mode', mode], {
      reject: false,
    })
    const output = lines(proc.stdout)
    const failing = output.indexOf('✖ failing tests:')
    const reported = failing === -1 ? output : output.slice(0, failing)
    const results = reported.flatMap((line) => {
      const match = line.match(STATUS)
      if (!match) {
        return []
      }
      const [, symbol, name, directive] = match
      const outcome =
        symbol === '﹣'
          ? 'skip'
          : directive
            ? 'todo'
            : symbol === '✔'
              ? 'pass'
              : 'fail'
      return [`${outcome} ${name}`]
    })
    return {
      proc,
      results,
      order: output.filter((line) => line.startsWith('ORDER ')),
    }
  }

  /**
   * Share identical `(name, mode)` CLI runs across parity and mode suites.
   */
  function runApi(name: string, mode: string) {
    const key = `${name}:${mode}`
    let pending = apiCache.get(key)
    if (!pending) {
      pending = execApi(name, mode)
      apiCache.set(key, pending)
    }
    return pending
  }

  /**
   * Run the same fixture with the real `node:test`.
   */
  async function runReal(name: string, flags: string[] = []) {
    const proc = await execa(
      process.execPath,
      [
        ...flags,
        '--no-warnings',
        '--import',
        pathToFileURL('mocks/node-test/use-real-node-test.js').href,
        '--test-reporter',
        pathToFileURL('mocks/node-test/real-reporter.js').href,
        fixture(name),
      ],
      { reject: false, timeout: 30_000 }
    )
    ok(!proc.timedOut, 'real node:test hung')
    const output = lines(proc.stdout)
    return {
      proc,
      results: output
        .filter((line) => line.startsWith('RESULT '))
        .map((line) => line.replace('RESULT ', '')),
      counts: JSON.parse(
        output.findLast((line) => line.startsWith('SUMMARY '))?.slice(8) ?? '{}'
      ),
      order: output.filter((line) => line.startsWith('ORDER ')),
    }
  }

  /**
   * Same execution order, per test results and exit code as the real `node:test`.
   */
  const parity = [
    { name: 'order', exitCode: 0 },
    { name: 'signatures', exitCode: 0 },
    { name: 'context', exitCode: 0 },
    { name: 'mock', exitCode: 0 },
    { name: 'async-suite', exitCode: 0 },
    { name: 'async-nested', exitCode: 0 },
    { name: 'top-level-await', exitCode: 1 },
    { name: 'fail-tests', exitCode: 1 },
    { name: 'fail-hooks', exitCode: 1 },
    { name: 'fail-root-before', exitCode: 1 },
    { name: 'fail-root-each', exitCode: 1 },
    { name: 'fail-uncaught', exitCode: 1 },
    { name: 'fail-falsy', exitCode: 1 },
    { name: 'shorthand', exitCode: 0 },
    { name: 'mock-assert', exitCode: 0 },
    { name: 'tags', exitCode: 0 },
    { name: 'mock-timers', exitCode: 0 },
    { name: 'concurrency', exitCode: 1, workerd: true },
    // Real node:test only filters with the flag, this API always does
    { name: 'only', exitCode: 0, flags: ['--test-only'] },
  ]

  describe('parity with node:test', { concurrency: TEST_CONCURRENCY }, () => {
    for (const { name, exitCode, flags, workerd } of parity) {
      describe(name, { concurrency: false }, () => {
        let real: Awaited<ReturnType<typeof runReal>>

        before(async () => {
          real = await runReal(name, flags)
          is(real.proc.exitCode, exitCode, real.proc.stderr)
          ok(real.results.length > 0, 'real node:test reported results')
        })

        for (const mode of workerd ? [...modes, 'workerd'] : modes) {
          it(mode, async () => {
            const api = await runApi(name, mode)

            equal(api.order, real.order)
            equal(api.results, real.results)
            is(api.proc.exitCode, exitCode, 'exit code')

            // `fail` is different, here failed hooks of suites also count
            for (const [key, label] of [
              ['tests', 'tests'],
              ['suites', 'suites'],
              ['passed', 'pass'],
              ['cancelled', 'cancelled'],
              ['skipped', 'skipped'],
              ['todo', 'todo'],
            ]) {
              is(summary(api.proc.stdout, label), real.counts[key], label)
            }
            ok(!api.order.some((line) => line.includes('NOT RUN')), 'not run')
          })
        }
      })
    }
  })

  describe('while the concurrency option runs several tests at once', {
    concurrency: TEST_CONCURRENCY,
  }, () => {
    const known = [
      'ORDER first before await: first',
      'ORDER second after await: second',
      'ORDER first after await: first',
      'ORDER test() in first: works',
      'ORDER one at a time: one again',
    ]

    for (const mode of ['node', 'workerd']) {
      it(`${mode} knows which test runs, with async context`, async () => {
        const { proc, order, results } = await runApi(
          'concurrency-context',
          mode
        )
        equal(order, known, proc.stdout)
        ok(results.includes('fail rejects'), proc.stdout)
        ok(results.includes('pass runs with it'), proc.stdout)
        ok(results.includes('pass inside first'), proc.stdout)
        is(proc.exitCode, 1, proc.stdout)
      })
    }

    for (const mode of ['browser', 'web-worker']) {
      it(`${mode} only knows before the first await`, async () => {
        const { proc, order, results } = await runApi(
          'concurrency-context',
          mode
        )
        const output = lines(proc.stdout).join('\n')
        equal(
          order,
          [
            'ORDER first before await: first',
            'ORDER second after await: unknown',
            'ORDER first after await: unknown',
            `ORDER test() in first: test() can't tell which test it belongs to, these run at the same time: "getTestContext > first", "getTestContext > second". Call it before the first await of the test, or use the context of the test, like t.test().`,
            'ORDER one at a time: one again',
          ],
          proc.stdout
        )
        // The test around both fails, and the other one is cancelled
        ok(results.includes('fail an unhandled rejection'), proc.stdout)
        ok(results.includes('fail runs with it'), proc.stdout)
        ok(
          output.includes(
            'ℹ An unhandled rejection happened while "an unhandled rejection > rejects", "an unhandled rejection > runs with it" ran at the same time, it can\'t be told which one it came from'
          ),
          output
        )
        is(proc.exitCode, 1, proc.stdout)
      })
    }
  })

  for (const mode of modes) {
    describe(`mode:${mode}`, { concurrency: TEST_CONCURRENCY }, () => {
      it('reports failures', async () => {
        const { proc } = await runApi('fail-tests', mode)
        const output = lines(proc.stdout).join('\n')

        is(proc.exitCode, 1, 'exit code')
        ok(output.includes('✖ failing tests:'), output)
        ok(output.includes('✖ sync throw'), output)
        ok(output.includes('Error: sync throw'), output)
        ok(output.includes('✖ throws a string'), output)
        ok(output.includes("'a string'"), output)
        ok(output.includes('test timed out after 20ms'), output)
        ok(output.includes('plan expected 2 assertions but received 1'), output)
        ok(output.includes('failing subtest'), output)
      })

      it('reports hook failures', async () => {
        const { proc } = await runApi('fail-hooks', mode)
        const output = lines(proc.stdout).join('\n')

        is(proc.exitCode, 1, 'exit code')
        ok(output.includes('Error: before throws'), output)
        ok(output.includes('Error: afterEach throws'), output)
      })

      // A throw in a root after hook exits with 0 with real node:test, this
      // would report a failure as a pass.
      it('a failure outside of a test counts as failing', async () => {
        const [suite, root] = await Promise.all([
          runApi('fail-suite-after', mode),
          runApi('fail-root-after', mode),
        ])
        const output = lines(root.proc.stdout).join('\n')

        is(suite.proc.exitCode, 1, 'exit code')
        is(summary(suite.proc.stdout, 'pass'), 1, suite.proc.stdout)
        is(summary(suite.proc.stdout, 'fail'), 1, suite.proc.stdout)
        is(root.proc.exitCode, 1, 'exit code')
        is(summary(root.proc.stdout, 'fail'), 1, output)
        ok(output.includes('✖ <root>'), output)
        ok(output.includes('root after throws'), output)
      })

      it('a failure without an error still fails the run', async () => {
        const { proc, order } = await runApi('fail-falsy', mode)

        is(proc.exitCode, 1, 'exit code')
        equal(order, ['ORDER runs after'])
        is(summary(proc.stdout, 'fail'), 2, proc.stdout)
        is(summary(proc.stdout, 'pass'), 1, proc.stdout)
      })

      it('showing an error can not stop the run', async () => {
        const { proc, order } = await runApi('fail-odd-errors', mode)
        const output = lines(proc.stdout).join('\n')

        is(proc.exitCode, 1, output)
        equal(order, ['ORDER runs after'])
        ok(output.includes('ℹ tests 9'), output)
        ok(output.includes('Error: shown without its inspector'), output)
        ok(output.includes('Error: shown without its stack'), output)
        ok(output.includes('ℹ Symbol(a symbol)'), output)
        ok(output.includes('✖ <root>'), output)
      })

      it('stacks without the name and message of the error', async () => {
        const { proc } = await runApi('fail-odd-errors', mode)
        const output = lines(proc.stdout).join('\n')

        ok(
          output.includes(
            'Error: in-a-frame\n      at in-a-frame (http://localhost/test.js:5:6)'
          ),
          output
        )
        ok(
          output.includes('Error\n      at fn (http://localhost/test.js:5:6)'),
          output
        )
        ok(output.includes('[Error: me@example.com]'), output)
        ok(
          output.includes(
            'at fn (http://localhost/node_modules/@scope/pkg/a.js:5:6)'
          ),
          output
        )
        ok(output.includes('at http://localhost/b.js:7:8'), output)
      })

      it('passing tests leave the exit code alone', async () => {
        const { proc } = await runApi('exit-code', mode)

        // The cli only tells if the run failed, see below for the code itself
        is(proc.exitCode, 1, proc.stdout)
      })

      it('no colors with NO_COLOR', async () => {
        const proc = await runCli(
          [fixture('fail-falsy'), ...runner, '--mode', mode],
          { reject: false, env: { FORCE_COLOR: undefined, NO_COLOR: '1' } }
        )

        is(proc.exitCode, 1, 'exit code')
        ok(proc.stdout.includes('✖ throws undefined'), proc.stdout)
        ok(proc.stdout.includes('\n  undefined\n'), proc.stdout)
        // biome-ignore lint/suspicious/noControlCharactersInRegex: ansi colors
        ok(!/\u001B\[/.test(proc.stdout), proc.stdout)
      })

      it('no colors when piped', async () => {
        // A color terminal, so only the pipe turns colors off
        const proc = await runCli(
          [fixture('fail-falsy'), ...runner, '--mode', mode],
          {
            reject: false,
            env: {
              FORCE_COLOR: undefined,
              NO_COLOR: undefined,
              NODE_DISABLE_COLORS: undefined,
              TERM: 'xterm-256color',
            },
          }
        )

        is(proc.exitCode, 1, 'exit code')
        ok(proc.stdout.includes('✖ throws undefined'), proc.stdout)
        // biome-ignore lint/suspicious/noControlCharactersInRegex: ansi colors
        ok(!/\u001B\[/.test(proc.stdout), proc.stdout)
      })

      it('colors with FORCE_COLOR when piped', async () => {
        const proc = await runCli(
          [fixture('fail-falsy'), ...runner, '--mode', mode],
          { reject: false, env: { FORCE_COLOR: '1', NO_COLOR: undefined } }
        )

        is(proc.exitCode, 1, 'exit code')
        // biome-ignore lint/suspicious/noControlCharactersInRegex: ansi colors
        ok(/\u001B\[/.test(proc.stdout), proc.stdout)
      })

      it('styleText follows the pipe and FORCE_COLOR', async () => {
        const styled = async (env: Record<string, string | undefined>) => {
          const proc = await runCli(
            [fixture('style-text'), ...runner, '--mode', mode],
            { reject: false, env: { NO_COLOR: undefined, ...env } }
          )
          is(proc.exitCode, 0, proc.stdout)
          return proc.stdout.match(/STYLED (.*)/)?.[1]
        }

        is(await styled({ FORCE_COLOR: undefined }), '"x"')
        is(
          await styled({ FORCE_COLOR: '1' }),
          JSON.stringify('\u001B[31mx\u001B[39m')
        )
      })

      it('root after hook runs when the run ends', async () => {
        // Real node:test runs it after the first test that was awaited
        const { proc, order } = await runApi('top-level-await-after', mode)

        is(proc.exitCode, 0, 'exit code')
        equal(order, ['ORDER first', 'ORDER second', 'ORDER root after'])
      })

      it('mock.timers removes what it added', async () => {
        const { proc, order } = await runApi('mock-timers-absent', mode)

        is(proc.exitCode, 0, proc.stdout)
        equal(order, [
          'ORDER immediate',
          'ORDER aborted true',
          'ORDER timeout removed true',
          'ORDER setImmediate removed true',
        ])
      })

      it('what is not implemented throws', async () => {
        const { proc, results } = await runApi('unsupported', mode)

        is(proc.exitCode, 0, proc.stdout)
        equal(results, ['pass throws for what is not implemented'])
      })

      it('works with the package entrypoint', async () => {
        const { proc, order, results } = await runApi('entrypoint', mode)

        is(proc.exitCode, 0, proc.stdout)
        // `exec`, `hold` and `configure` aren't in `node:test`
        equal(order, ['ORDER internal exports: 0'])
        equal(results, [
          'pass works',
          'pass from the package entrypoint',
          'pass default export',
        ])
      })

      it('multiple files share the run', async () => {
        const proc = await runCli([
          'mocks/node-test/multi',
          ...runner,
          '--mode',
          mode,
        ])

        is(proc.exitCode, 0, 'exit code')
        is(summary(proc.stdout, 'pass'), 2, proc.stdout)
        ok(
          proc.stdout.includes('ORDER root beforeEach from file b'),
          proc.stdout
        )
      })
    })
  }

  describe('without a runner', { concurrency: TEST_CONCURRENCY }, () => {
    it('node runs it, with an absolute path to the binary', async () => {
      const { exitCode, stdout } = await execa(process.execPath, [
        fixture('order'),
      ])

      is(exitCode, 0, 'exit code')
      is(summary(stdout, 'pass'), 13, stdout)
    })

    it('node runs it, however the binary was called', async () => {
      const { exitCode, stdout } = await execa(
        process.execPath,
        [fixture('order')],
        { argv0: 'node' }
      )

      is(exitCode, 0, 'exit code')
      is(summary(stdout, 'pass'), 13, stdout)
    })

    it('node keeps an exit code that was already set', async () => {
      const { exitCode } = await execa(
        process.execPath,
        [fixture('exit-code')],
        { reject: false }
      )

      is(exitCode, 3, 'exit code')
    })

    it('node sets the exit code', async () => {
      const { exitCode, stdout } = await execa(
        process.execPath,
        [fixture('fail-root-each')],
        { reject: false }
      )

      is(exitCode, 1, 'exit code')
      is(summary(stdout, 'fail'), 2, stdout)
    })

    it('top level await', async () => {
      const { exitCode, stdout } = await execa(
        process.execPath,
        [fixture('top-level-await')],
        { reject: false }
      )

      is(exitCode, 1, 'exit code')
      is(summary(stdout, 'fail'), 1, stdout)
      is(summary(stdout, 'pass'), 5, stdout)
    })

    it('runner none in node mode', async () => {
      const { exitCode, stdout } = await runCli(
        [fixture('fail-root-each'), '--runner', 'none', '--mode', 'node'],
        { reject: false }
      )

      is(exitCode, 1, 'exit code')
      is(summary(stdout, 'fail'), 2, stdout)
    })

    it('a test created after the run throws', async () => {
      const { exitCode, stdout, stderr } = await execa(
        process.execPath,
        [fixture('late-test')],
        { reject: false }
      )

      is(exitCode, 0, `${stdout}\n${stderr}`)
    })
  })

  describe('same output as the spec reporter of node:test', {
    concurrency: TEST_CONCURRENCY,
  }, () => {
    /**
     * What doesn't change between runs: test durations and the total are out, and
     * so is `fail` since failed hooks of suites also count here. Of the list of
     * failing tests only which ones, the errors have stacks with other frames.
     */
    const normalize = (text: string) => {
      const output = lines(text)
      const failing = output.indexOf('✖ failing tests:')
      ok(failing !== -1, text)
      return [
        ...output
          .slice(0, failing)
          .filter((line) => line.trim() !== '')
          .filter((line) => !/^ℹ (?:duration_ms|fail) /.test(line)),
        ...output.slice(failing).filter((line) => STATUS.test(line)),
      ].map((line) => line.replace(/ \(\d+(?:\.\d+)?ms\)/, ''))
    }

    let real: string[]

    before(async () => {
      const proc = await execa(
        process.execPath,
        [
          '--no-warnings',
          '--import',
          pathToFileURL('mocks/node-test/use-real-node-test.js').href,
          '--test-reporter=spec',
          fixture('spec-format'),
        ],
        { reject: false, timeout: 30_000, env: { NO_COLOR: '1' } }
      )
      is(proc.exitCode, 1, proc.stderr)
      real = normalize(proc.stdout)
    })

    for (const mode of modes) {
      it(mode, async () => {
        const proc = await runCli(
          [fixture('spec-format'), ...runner, '--mode', mode],
          { reject: false, env: { NO_COLOR: '1' } }
        )

        is(proc.exitCode, 1, 'exit code')
        equal(normalize(proc.stdout), real)
      })
    }
  })

  describe('node:assert', { concurrency: TEST_CONCURRENCY }, () => {
    // Fails on any difference with the real node:assert, browsers.test.ts runs it in the others.
    it('same results as the real one', async () => {
      const { exitCode, stdout, stderr } = await execa(
        process.execPath,
        ['mocks/node-test/assert-compare.js'],
        { reject: false }
      )

      is(exitCode, 0, `${stdout}\n${stderr}`)
      for (const mode of ['node', 'browser', 'web-worker']) {
        ok(stdout.includes(`${mode}: `), stdout)
      }
    })

    for (const mode of ['browser', 'web-worker']) {
      it(`${mode}: exports and unsupported`, async () => {
        const { exitCode, stdout } = await runCli(
          [fixture('assert-exports'), '--runner', 'none', '--mode', mode],
          { reject: false }
        )

        is(exitCode, 0, stdout)
        ok(stdout.includes('EXPORTS OK'), stdout)
      })
    }

    it('node: exports are the built-in', async () => {
      const { exitCode, stdout } = await execa(
        process.execPath,
        ['mocks/node-test/assert-builtin.test.js'],
        { reject: false }
      )

      is(exitCode, 0, stdout)
      ok(stdout.includes('EXPORTS OK'), stdout)
    })

    it('t.assert reports failures in browsers', async () => {
      const { proc, results } = await runApi('assert-context', 'browser')

      is(proc.exitCode, 1, proc.stdout)
      equal(results, [
        'pass loose equal',
        'fail strict method',
        'fail nested URL',
        'pass partial',
        'fail throws operator',
      ])
      ok(proc.stdout.includes('operator'), proc.stdout)
    })
  })

  // Real node:test hangs, a browser can't tell and needs the timeout option.
  it('a test that never settles fails in node', async () => {
    const { proc, results } = await runApi('fail-hang', 'node')

    is(proc.exitCode, 1, 'exit code')
    equal(results, ['fail never settles', 'fail never starts'])
    ok(proc.stdout.includes('Promise resolution is still pending'), proc.stdout)
    ok(!proc.stdout.includes('NOT RUN'), proc.stdout)
  })

  describe('in an AI agent', { concurrency: TEST_CONCURRENCY }, () => {
    const agent = {
      AI_AGENT: 'test-agent',
      FORCE_COLOR: undefined,
      NO_COLOR: undefined,
    }
    const run = (
      mode: string,
      env: Record<string, string | undefined> = agent
    ) =>
      runCli([fixture('minimal'), ...runner, '--mode', mode], {
        reject: false,
        env,
      })

    for (const mode of ['node', 'browser']) {
      it(`only prints failures and their parents in ${mode} mode`, async () => {
        const proc = await run(mode)
        is(proc.exitCode, 1)
        const output = proc.stdout.split('\n')
        const failing = output.indexOf('✖ failing tests:')
        const tree = output.slice(0, failing).filter((l) => /[▶✔✖﹣⚠]/.test(l))
        equal(
          tree.map((l) => l.replace(/ \(\d.*$/, '')),
          [
            '▶ outer',
            '  ▶ inner',
            '    ✖ nested fails',
            '  ✖ inner',
            '✖ outer',
            '✖ top fails',
          ]
        )
        ok(output.includes('    ℹ shown with the failure'))
        ok(!proc.stdout.includes('hidden'))
        ok(!proc.stdout.includes('todo fails'))
        is(summary(proc.stdout, 'tests'), 6)
        is(summary(proc.stdout, 'pass'), 2)
        is(summary(proc.stdout, 'fail'), 2)
        is(summary(proc.stdout, 'skipped'), 1)
        is(summary(proc.stdout, 'todo'), 1)
        ok(proc.stdout.includes('console from a passing test'))
        ok(
          !proc.stdout
            .replaceAll('\u001B[35mtest color\u001B[39m', '')
            .includes('\u001B[')
        )
        ok(proc.stdout.includes('\u001B[35mtest color\u001B[39m'))
      })

      it(`keeps the summary of passing runs in ${mode} mode`, async () => {
        const proc = await runCli(
          [fixture('minimal-pass'), ...runner, '--mode', mode],
          { reject: false, env: agent }
        )
        is(proc.exitCode, 0)
        ok(!/[▶✔✖]/.test(proc.stdout))
        is(summary(proc.stdout, 'pass'), 2)
      })

      it(`colors the output with FORCE_COLOR in ${mode} mode`, async () => {
        const proc = await run(mode, { ...agent, FORCE_COLOR: '1' })
        ok(proc.stdout.includes('\u001B[31m✖ top fails\u001B[39m'))
      })

      it(`keeps the spec output without an agent in ${mode} mode`, async () => {
        const proc = await run(mode, { FORCE_COLOR: undefined })
        const output = lines(proc.stdout)
        ok(output.some((l) => l.startsWith('    ✔ nested hidden')))
        ok(output.some((l) => l.startsWith('    ﹣ skipped hidden')))
        ok(output.some((l) => l.startsWith('⚠ todo fails')))
        ok(output.includes('ℹ root hidden'))
      })
    }
  })
})
