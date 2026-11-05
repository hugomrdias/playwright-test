import { execa, execaSync } from 'execa'
import fs from 'fs'
import path from 'path'
import { is, ok } from 'uvu/assert'

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
    ok(proc.stdout.includes('12 passing'), proc.stdout)
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
