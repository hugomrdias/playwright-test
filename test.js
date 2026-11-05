import { execa, execaSync } from 'execa'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { equal, is, ok } from 'uvu/assert'

describe('node mode outside the package', () => {
  const cli = path.resolve('cli.js')
  const none = ['--runner', 'none', '--mode', 'node']
  /** @type {string} */
  let project

  beforeEach(() => {
    // The temp dir has no node_modules/.bin in any of its parent folders
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'))
  })

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true })
  })

  /**
   * PATH without the folders where c8 can be found, `pnpm run` adds our own
   */
  function envWithoutC8() {
    const key =
      Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
    const dirs = (process.env[key] ?? '')
      .split(path.delimiter)
      .filter(
        (dir) =>
          !['c8', 'c8.cmd'].some((bin) => fs.existsSync(path.join(dir, bin)))
      )
    return { [key]: dirs.join(path.delimiter) }
  }

  it('coverage without c8 in the project', async () => {
    // c8 leaves test files out of the report
    fs.writeFileSync(path.join(project, 'lib.js'), 'export const a = 1\n')
    fs.writeFileSync(
      path.join(project, 'entry.test.js'),
      "import { a } from './lib.js'\nconsole.log('hello from entry', a)\n"
    )

    const proc = await execa(
      process.execPath,
      [cli, 'entry.test.js', '--cov', ...none],
      { cwd: project, env: envWithoutC8(), reject: false }
    )

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes('hello from entry'), proc.stdout)
    ok(proc.stdout.includes('lib.js'), proc.stdout)
    ok(fs.existsSync(path.join(project, '.nyc_output/coverage-final.json')))
  })

  it('reports why tests could not start', async () => {
    fs.mkdirSync(path.join(project, 'sub'))
    fs.writeFileSync(path.join(project, 'sub/entry.test.js'), '')
    // Removing the cwd right before the tests start makes the spawn fail
    fs.writeFileSync(
      path.join(project, 'pw.config.mjs'),
      `import fs from 'node:fs'
export default {
  beforeTests() {
    fs.rmSync('sub', { recursive: true })
  },
}
`
    )

    const proc = await execa(
      process.execPath,
      [
        cli,
        'entry.test.js',
        '--cwd',
        'sub',
        '--config',
        'pw.config.mjs',
        ...none,
      ],
      { cwd: project, reject: false }
    )

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Could not start tests:'), proc.stderr)
  })

  it('failing tests only report the failure', async () => {
    fs.writeFileSync(path.join(project, 'entry.test.js'), 'process.exit(1)\n')

    const proc = await execa(
      process.execPath,
      [cli, 'entry.test.js', ...none],
      { cwd: project, reject: false }
    )

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Tests failed.'), proc.stderr)
    ok(!proc.stderr.includes('Could not start tests:'), proc.stderr)
  })
})

describe('mocha', () => {
  it('basic', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.js',
      '--runner',
      'mocha',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('fixtures', async () => {
    const proc = await execa('./cli.js', [
      'mocks/fixtures.mocha.js',
      '--runner',
      'mocha',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('node', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.js',
      '--runner',
      'mocha',
      '--mode',
      'node',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('node typescript', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.ts',
      '--runner',
      'mocha',
      '--mode',
      'node',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('node coverage', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.js',
      '--runner',
      'mocha',
      '--mode',
      'node',
      '--cov',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
    ok(proc.stdout.includes('test.mocha.js'), 'coverage maps to source files')
  })

  it('auto detect', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stderr.includes('Autodetected "mocha" as the runner'), proc.stderr)
  })

  it('coverage', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--cov'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')

    const cov = JSON.parse(
      fs.readFileSync('.nyc_output/coverage-pw.json', 'utf8')
    )
    ok(path.resolve('mocks/test.mocha.js') in cov, 'test coverage')
  })

  it('coverage with alternate report dir', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.js',
      '--cov',
      '--report-dir',
      '.coverage',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')

    const cov = JSON.parse(
      fs.readFileSync('.coverage/coverage-pw.json', 'utf8')
    )
    ok(path.resolve('mocks/test.mocha.js') in cov, 'test coverage')
  })

  it('cwd', async () => {
    const proc = await execa('./cli.js', [
      'test.mocha.js',
      '--cwd',
      path.resolve('mocks'),
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('coverage with cwd', async () => {
    const proc = await execa('./cli.js', [
      'test.mocha.js',
      '--cwd',
      path.resolve('mocks'),
      '--cov',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')

    const cov = JSON.parse(
      fs.readFileSync('mocks/.nyc_output/coverage-pw.json', 'utf8')
    )

    ok(path.resolve('mocks/test.mocha.js') in cov, 'test coverage')
  })

  it('with DEBUG=app', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js'], {
      env: { DEBUG: 'app' },
    })

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
    ok(proc.stdout.includes('app test pass'), 'debug output')
  })

  it('incognito', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--incognito'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('mode:worker', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.js',
      '--mode',
      'worker',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('mocha extension', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--extension'])
    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('sw', () => {
    const proc = execaSync('./cli.js', [
      'mocks/sw/sw-test.js',
      '--sw',
      'mocks/sw/sw.js',
      '--config',
      'mocks/sw/sw.config.cjs',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('1 passing'), 'process stdout')
  })

  it('supports esm config files', async () => {
    const proc = await execa('./cli.js', [
      'mocks/sw/sw-test.js',
      '--sw',
      'mocks/sw/sw.js',
      '--config',
      'mocks/sw/sw.config.mjs',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('1 passing'), 'process stdout')
  })

  it('supports esm config files that return promises', async () => {
    const proc = await execa('./cli.js', [
      'mocks/sw/sw-test.js',
      '--sw',
      'mocks/sw/sw.js',
      '--config',
      'mocks/sw/sw.promise.config.mjs',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('1 passing'), 'process stdout')
  })

  it('supports esm config files that return functions', async () => {
    const proc = await execa('./cli.js', [
      'mocks/sw/sw-test.js',
      '--sw',
      'mocks/sw/sw.js',
      '--config',
      'mocks/sw/sw.function.config.mjs',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('1 passing'), 'process stdout')
  })
})

describe('tape', () => {
  it('tape', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.tape.js',
      '--runner',
      'tape',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('# pass  5'), 'process stdout')
  })

  it('node', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.tape.js',
      '--runner',
      'tape',
      '--mode',
      'node',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('# pass  5'), 'process stdout')
  })

  it('autodetect', async () => {
    const proc = await execa('./cli.js', ['mocks/test.tape.js'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stderr.includes('Autodetected "tape" as the runner'), proc.stderr)
  })

  it('tape mode:worker', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.tape.js',
      '--runner',
      'tape',
      '--mode',
      'worker',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('# pass  5'), 'process stdout')
  })
})

describe('uvu', () => {
  it('basic', async () => {
    const proc = await execa('./cli.js', ['mocks/uvu', '--runner', 'uvu'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Skipped:   0'), 'process stdout')
  })

  it('node', async () => {
    const proc = await execa('./cli.js', [
      'mocks/uvu',
      '--runner',
      'uvu',
      '--mode',
      'node',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Skipped:   0'), 'process stdout')
  })

  it('autodetect', async () => {
    const proc = await execa('./cli.js', ['mocks/uvu'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stderr.includes('Autodetected "uvu" as the runner'), proc.stderr)
  })

  it('mode:worker', async () => {
    const proc = await execa('./cli.js', [
      'mocks/uvu',
      '--runner',
      'uvu',
      '--mode',
      'worker',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Skipped:   0'), 'process stdout')
  })
})

describe.skip('benchmark', () => {
  it('benchmark', async () => {
    const proc = await execa('./cli.js', [
      'mocks/benchmark.js',
      '--runner',
      'benchmark',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Fastest is String#indexOf'), 'process stdout')
  })
})

describe('custom runner', () => {
  it('module from file', async () => {
    const proc = await execa('./cli.js', [
      'mocks/tinybench.js',
      '--runner',
      './mocks/custom-runner.js',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Setup complete'), 'process stdout')
  })

  it('module from config', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.js',
      '--config',
      'mocks/config.js',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })
})

describe('taps', () => {
  it('basic', async () => {
    const proc = await execa('./cli.js', ['mocks/tops'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('node', async () => {
    const proc = await execa('./cli.js', ['mocks/tops', '--mode', 'node'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })
})

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
    const proc = await execa(
      './cli.js',
      [fixture(name), ...runner, '--mode', mode],
      { reject: false }
    )
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
        const proc = await execa('./cli.js', [
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
      const { exitCode, stdout } = await execa(
        './cli.js',
        [fixture('fail-root-each'), '--runner', 'none', '--mode', 'node'],
        { reject: false }
      )

      is(exitCode, 1, 'exit code')
      ok(stdout.includes('2 failing'), stdout)
    })
  })

  describe('node:assert', () => {
    // Fails on any difference with the real node:assert, CI also runs it in firefox and webkit.
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
        const { exitCode, stdout } = await execa(
          './cli.js',
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

describe('node mode transform', () => {
  const node = ['--mode', 'node']
  const mocha = ['--runner', 'mocha', ...node]
  const none = ['--runner', 'none', ...node]

  it('full typescript', async () => {
    const proc = await execa('./cli.js', [
      'mocks/transform/syntax.test.ts',
      ...mocha,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('4 passing'), proc.stdout)
  })

  it('jsx, resolution, module formats and import.meta.env', async () => {
    const proc = await execa('./cli.js', [
      'mocks/transform/imports.test.ts',
      ...mocha,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('13 passing'), proc.stdout)
  })

  it('buildConfig', async () => {
    const proc = await execa('./cli.js', [
      'mocks/transform/config.test.tsx',
      '--config',
      'mocks/transform/pw.config.js',
      ...mocha,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('6 passing'), proc.stdout)
  })

  it('stack traces point at the typescript source', async () => {
    const proc = await execa('./cli.js', ['mocks/transform/stack.ts', ...none])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('stack.ts:11:11'), proc.stdout)
    ok(proc.stdout.includes('stack.ts:16:26'), proc.stdout)
  })

  it('coverage maps to the source files', async () => {
    const proc = await execa('./cli.js', [
      'mocks/transform/imports.test.ts',
      '--report-dir',
      '.coverage',
      '--cov',
      ...mocha,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('extensionless.ts'), proc.stdout)
    ok(proc.stdout.includes('view.tsx'), proc.stdout)

    const cov = JSON.parse(
      fs.readFileSync('.coverage/coverage-final.json', 'utf8')
    )
    ok(path.resolve('mocks/transform/lib/rewritten.ts') in cov, 'ts coverage')
    ok(path.resolve('mocks/transform/lib/view.tsx') in cov, 'tsx coverage')
    ok(path.resolve('mocks/transform/lib/module.mts') in cov, 'mts coverage')
    ok(path.resolve('mocks/transform/lib/common.cts') in cov, 'cts coverage')
  })

  it('import.meta.env', async () => {
    const proc = await execa('./cli.js', ['mocks/transform/plain.ts', ...none])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('import.meta.env: object'), proc.stdout)
  })

  it('--no-transform runs erasable typescript as plain node', async () => {
    const proc = await execa('./cli.js', [
      'mocks/transform/plain.ts',
      '--no-transform',
      ...none,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('import.meta.env: undefined'), proc.stdout)
  })

  it('--no-transform rejects non-erasable typescript', async () => {
    const proc = await execa(
      './cli.js',
      ['mocks/transform/syntax.test.ts', '--no-transform', ...mocha],
      { reject: false }
    )

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'), proc.stderr)
  })

  it('transform: false in the config file', async () => {
    const proc = await execa('./cli.js', [
      'mocks/transform/plain.ts',
      '--config',
      'mocks/transform/no-transform.config.js',
      ...none,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('import.meta.env: undefined'), proc.stdout)
  })
})

describe('stdout / stderr', () => {
  it('does not add line breaks', async () => {
    const proc = await execa('./cli.js', [
      'mocks/none/stdout.test.js',
      '--runner',
      'none',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('hello world!'), 'process stdout')
  })

  it('works in worker', async () => {
    const proc = await execa('./cli.js', [
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
    const proc = await execa('./cli.js', [
      'mocks/none/stderr.test.js',
      '--runner',
      'none',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('hello '), 'process stdout')
    ok(proc.stderr.includes('world!'), 'process stdout')
  })

  it('prints to stderr in worker', async () => {
    const proc = await execa('./cli.js', [
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
