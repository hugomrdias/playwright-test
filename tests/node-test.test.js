import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { pathToFileURL } from 'url'
import { execa, runCli } from './helpers.js'

describe('taps node:test api', () => {
  const runner = ['--runner', './mocks/node-test/runner.js']
  const modes = ['node', 'main', 'worker']

  /**
   * @param {string} name
   */
  const fixture = (name) => `mocks/node-test/${name}.test.js`

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
    const results = output.flatMap((line) => {
      const match = line.match(/^(✔|✘|-) \d+ (.*) \(\d+\.\d+ms\)$/)
      if (!match) {
        return []
      }
      const [, symbol, reported] = match
      const directive = reported.match(/ # (SKIP|TODO)( .*)?$/)
      const fullName = directive ? reported.slice(0, directive.index) : reported
      const outcome = directive
        ? directive[1].toLowerCase()
        : symbol === '✔'
          ? 'pass'
          : 'fail'
      return [`${outcome} ${fullName.split(' > ').at(-1)}`]
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
      order: output.filter((line) => line.startsWith('ORDER ')),
    }
  }

  /**
   * @param {string[]} results
   * @param {string} outcome
   */
  const count = (results, outcome) =>
    results.filter((result) => result.startsWith(`${outcome} `)).length

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

          const output = lines(api.proc.stdout).join('\n')
          for (const [outcome, label] of [
            ['pass', 'passing'],
            ['skip', 'skipping'],
            ['todo', 'todo'],
          ]) {
            const expected = count(real.results, outcome)
            is(
              output.includes(`  ${expected} ${label}`),
              expected > 0,
              `${expected} ${label}`
            )
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
        ok(output.includes(' FAILURE  "sync throw"'), output)
        ok(output.includes('Error: sync throw'), output)
        ok(output.includes(' FAILURE  "throws a string"'), output)
        ok(output.includes('Error: a string'), output)
        ok(output.includes('test timed out after 20ms'), output)
        ok(output.includes('plan expected 2 assertions but received 1'), output)
        ok(output.includes('failing subtest'), output)
        ok(output.includes('✘ '), output)
      })

      it('reports hook failures', async () => {
        const { proc } = await runApi('fail-hooks', mode)
        const output = lines(proc.stdout).join('\n')

        is(proc.exitCode, 1, 'exit code')
        ok(output.includes('failed running before hook'), output)
        ok(output.includes('Caused by Error: before throws'), output)
        ok(output.includes('failed running afterEach hook'), output)
      })

      // Exits with 0 with real node:test, this would report a failure as a pass.
      it('a throw in a root after hook fails the run', async () => {
        const { proc } = await runApi('fail-root-after', mode)
        const output = lines(proc.stdout).join('\n')

        is(proc.exitCode, 1, 'exit code')
        ok(output.includes('failed running after hook'), output)
        ok(output.includes('root after throws'), output)
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
        equal(order, ['ORDER exec function hold function'])
        equal(results, ['pass works', 'pass default export'])
      })

      it('multiple files share the run', async () => {
        const proc = await runCli([
          'mocks/node-test/multi',
          ...runner,
          '--mode',
          mode,
        ])

        is(proc.exitCode, 0, 'exit code')
        ok(proc.stdout.includes('2 passing'), proc.stdout)
        ok(
          proc.stdout.includes('ORDER root beforeEach from file b'),
          proc.stdout
        )
      })

      describe('with playwright-test/taps in the same file', () => {
        it('runs both', async () => {
          const { proc, order, results } = await runApi('mixed', mode)

          is(proc.exitCode, 0, proc.stdout)
          equal(order, [
            'ORDER taps default suite',
            'ORDER node test',
            'ORDER node nested',
            'ORDER taps named test',
          ])
          equal(results, [
            'pass taps default suite',
            'pass node test',
            'pass node nested',
            'pass taps named test',
          ])
          ok(proc.stdout.includes('4 passing'), proc.stdout)
        })

        it('fails when a node:test test fails', async () => {
          const { proc } = await runApi('mixed-fail', mode)

          is(proc.exitCode, 1, 'exit code')
          ok(proc.stdout.includes('1 failing'), proc.stdout)
          ok(proc.stdout.includes('2 passing'), proc.stdout)
        })

        it('fails when a taps test fails', async () => {
          const { proc } = await runApi('mixed-taps-fail', mode)

          is(proc.exitCode, 1, 'exit code')
          ok(proc.stdout.includes('1 failing'), proc.stdout)
          ok(proc.stdout.includes('1 passing'), proc.stdout)
        })

        it('only applies to both', async () => {
          const { proc, order } = await runApi('mixed-only', mode)

          is(proc.exitCode, 0, proc.stdout)
          equal(order, ['ORDER node only', 'ORDER taps only'])
        })
      })
    })
  }

  describe('without a runner', () => {
    it('node runs it, with an absolute path to the binary', async () => {
      const { exitCode, stdout } = await execa(process.execPath, [
        fixture('order'),
      ])

      is(exitCode, 0, 'exit code')
      ok(stdout.includes('13 passing'), stdout)
    })

    it('node sets the exit code', async () => {
      const { exitCode, stdout } = await execa(
        process.execPath,
        [fixture('fail-root-each')],
        { reject: false }
      )

      is(exitCode, 1, 'exit code')
      ok(stdout.includes('2 failing'), stdout)
    })

    it('top level await', async () => {
      const { exitCode, stdout } = await execa(
        process.execPath,
        [fixture('top-level-await')],
        { reject: false }
      )

      is(exitCode, 1, 'exit code')
      ok(stdout.includes('1 failing'), stdout)
      ok(stdout.includes('5 passing'), stdout)
    })

    it('runner none in node mode', async () => {
      const { exitCode, stdout } = await runCli(
        [fixture('fail-root-each'), '--runner', 'none', '--mode', 'node'],
        { reject: false }
      )

      is(exitCode, 1, 'exit code')
      ok(stdout.includes('2 failing'), stdout)
    })
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
