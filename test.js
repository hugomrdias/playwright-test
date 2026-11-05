import { execa, execaSync } from 'execa'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { is, ok } from 'uvu/assert'

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

describe('console output when the run ends', () => {
  // CI also runs these in firefox, it's where the messages arrive late
  const browser = process.env.PW_TEST_BROWSER ?? 'chromium'

  /**
   * @param {string} fixture
   * @param {string} mode
   */
  function run(fixture, mode) {
    return execa('./cli.js', [
      `mocks/none/${fixture}.test.js`,
      '--runner',
      'none',
      '--mode',
      mode,
      '--browser',
      browser,
    ])
  }

  /**
   * @param {string} output
   * @param {string} prefix
   */
  function linesWith(output, prefix) {
    return output.split('\n').filter((line) => line.includes(prefix))
  }

  for (const mode of ['worker', 'main']) {
    it(`prints every line to stdout with mode:${mode}`, async () => {
      const total = 10_000
      const proc = await run('console-flood', mode)

      is(proc.exitCode, 0, 'exit code')
      const lines = linesWith(proc.stdout, 'console-flood-')
      is(lines.length, total, 'lines on stdout')
      ok(
        lines.every((line, i) => line === `console-flood-${i}`),
        'lines in order'
      )
      is(linesWith(proc.stderr, 'console-flood-').length, 0, 'lines on stderr')
    })
  }

  it('waits for arguments still being read', async () => {
    const proc = await run('console-slow-args', 'worker')

    is(proc.exitCode, 0, 'exit code')
    const lines = linesWith(proc.stdout, 'console-slow-')
    is(lines.length, 50, 'lines on stdout')
    ok(!proc.stdout.includes('undefined'), 'arguments were read')
    is(linesWith(proc.stderr, 'console-slow-').length, 0, 'lines on stderr')
  })

  it('does not wait forever for a stuck page', async () => {
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
