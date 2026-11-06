import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { pathToFileURL } from 'url'
import { execa, runCli } from './helpers.js'

describe('playwright-test/node-test', () => {
  const runner = ['--runner', 'node-test']
  const modes = ['node', 'main', 'worker']

  /** A test in the output: its symbol, name and what's after `#`. */
  const STATUS = /^\s*(✔|✖|﹣|⚠) (.*) \(\d+(?:\.\d+)?ms\)(?: # (.*))?$/

  /**
   * @param {string} name
   */
  const fixture = (name) => `mocks/node-test/${name}.test.js`

  /**
   * The value of a line of the summary.
   *
   * @param {string} text
   * @param {string} label
   */
  const summary = (text, label) =>
    Number(
      lines(text)
        .find((l) => l.startsWith(`ℹ ${label} `))
        ?.split(' ')[2]
    )

  /**
   * @param {string} text
   */
  const lines = (text) =>
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ansi colors
    text.replaceAll(/\u001B\[[0-9;]*m/g, '').split('\n')

  /**
   * Run a fixture with this API, and read what it reported.
   *
   * @param {string} name
   * @param {string} mode
   */
  async function runApi(name, mode) {
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
   * Run the same fixture with the real `node:test`.
   *
   * @param {string} name
   * @param {string[]} [flags]
   */
  async function runReal(name, flags = []) {
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
    // Real node:test only has these assertions since Node.js 26
    ...(Number.parseInt(process.versions.node, 10) >= 26
      ? [{ name: 'mock-assert', exitCode: 0 }]
      : []),
    // Real node:test only filters with the flag, this API always does
    { name: 'only', exitCode: 0, flags: ['--test-only'] },
  ]

  for (const { name, exitCode, flags } of parity) {
    describe(`parity with node:test: ${name}`, () => {
      /** @type {Awaited<ReturnType<typeof runReal>>} */
      let real

      before(async () => {
        real = await runReal(name, flags)
        is(real.proc.exitCode, exitCode, real.proc.stderr)
        ok(real.results.length > 0, 'real node:test reported results')
      })

      for (const mode of modes) {
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

  for (const mode of modes) {
    describe(`mode:${mode}`, () => {
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

      // Exits with 0 with real node:test, this would report a failure as a pass.
      it('a throw in a root after hook fails the run', async () => {
        const { proc } = await runApi('fail-root-after', mode)
        const output = lines(proc.stdout).join('\n')

        is(proc.exitCode, 1, 'exit code')
        ok(output.includes('✖ <root>'), output)
        ok(output.includes('root after throws'), output)
      })

      it('a failure outside of a test counts as failing', async () => {
        const suite = await runApi('fail-suite-after', mode)
        const root = await runApi('fail-root-after', mode)

        is(suite.proc.exitCode, 1, 'exit code')
        is(summary(suite.proc.stdout, 'pass'), 1, suite.proc.stdout)
        is(summary(suite.proc.stdout, 'fail'), 1, suite.proc.stdout)
        is(root.proc.exitCode, 1, 'exit code')
        is(summary(root.proc.stdout, 'fail'), 1, root.proc.stdout)
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

      it('mock assertions in t.assert', async () => {
        const { proc } = await runApi('mock-assert', mode)

        is(proc.exitCode, 0, proc.stdout)
        is(summary(proc.stdout, 'pass'), 6, proc.stdout)
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

      it('root after hook runs when the run ends', async () => {
        // Real node:test runs it after the first test that was awaited
        const { proc, order } = await runApi('top-level-await-after', mode)

        is(proc.exitCode, 0, 'exit code')
        equal(order, ['ORDER first', 'ORDER second', 'ORDER root after'])
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

  describe('without a runner', () => {
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
  })

  describe('same output as the spec reporter of node:test', () => {
    /**
     * What doesn't change between runs: test durations and the total are out, and
     * so is `fail` since failed hooks of suites also count here. Of the list of
     * failing tests only which ones, the errors have stacks with other frames.
     *
     * @param {string} text
     */
    const normalize = (text) => {
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

    /** @type {string[]} */
    let real

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

  describe('node:assert', () => {
    // Fails on any difference with the real node:assert, browsers.test.js runs it in the others.
    it('same results as the real one', async () => {
      const { exitCode, stdout, stderr } = await execa(
        process.execPath,
        ['mocks/node-test/assert-compare.js'],
        { reject: false }
      )

      is(exitCode, 0, `${stdout}\n${stderr}`)
      for (const mode of ['node', 'main', 'worker']) {
        ok(stdout.includes(`${mode}: `), stdout)
      }
    })

    for (const mode of ['main', 'worker']) {
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
      const { proc, results } = await runApi('assert-context', 'main')

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
})
