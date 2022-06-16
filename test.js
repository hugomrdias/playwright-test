import fs from 'fs'
import path from 'path'
import { ok, is } from 'uvu/assert'
import { execa } from 'execa'

describe('mocha', function () {
  it('basic', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('5 passing'), 'process stdout')
  })

  it('coverage', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--cov'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('5 passing'), 'process stdout')

    const cov = JSON.parse(
      // eslint-disable-next-line unicorn/prefer-json-parse-buffer
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
    ok(proc.stdout.includes('5 passing'), 'process stdout')

    const cov = JSON.parse(
      // eslint-disable-next-line unicorn/prefer-json-parse-buffer
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
    ok(proc.stdout.includes('5 passing'), 'process stdout')
  })

  it('coverage with cwd', async () => {
    const proc = await execa('./cli.js', [
      'test.mocha.js',
      '--cwd',
      path.resolve('mocks'),
      '--cov',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('5 passing'), 'process stdout')

    const cov = JSON.parse(
      // eslint-disable-next-line unicorn/prefer-json-parse-buffer
      fs.readFileSync('mocks/.nyc_output/coverage-pw.json', 'utf8')
    )

    ok(path.resolve('mocks/test.mocha.js') in cov, 'test coverage')
  })

  it('with DEBUG=app', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js'], {
      env: { DEBUG: 'app' },
    })

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('5 passing'), 'process stdout')
    ok(proc.stdout.includes('app test pass'), 'debug output')
  })

  it('incognito', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--incognito'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('5 passing'), 'process stdout')
  })

  it('mode:worker', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.js',
      '--mode',
      'worker',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('5 passing'), 'process stdout')
  })

  it('mocha extension', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--extension'])
    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('5 passing'), 'process stdout')
  })

  it('sw', async () => {
    const proc = await execa('./cli.js', [
      'mocks/sw/sw-test.js',
      '--sw',
      'mocks/sw/sw.js',
      '--config',
      'mocks/sw/sw.config.js',
    ])

    is(proc.exitCode, 0, 'exit code')
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
  })
})

describe('tape', function () {
  it('tape', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.tape.js',
      '--runner',
      'tape',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('# pass  5'), 'process stdout')
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

describe('zora', () => {
  it('zora', async () => {
    const proc = await execa(
      './cli.js',
      ['mocks/*.zora.js', '--runner', 'zora'],
      {
        env: {
          ZORA_ONLY: 'true',
        },
      }
    )

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('# pass  2'), 'process stdout')
  })

  it('zora mode:worker', async () => {
    const proc = await execa(
      './cli.js',
      ['mocks/*.zora.js', '--runner', 'zora', '--mode', 'worker'],
      {
        env: {
          RUN_ONLY: 'true',
          INDENT: 'true',
        },
      }
    )

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('# pass  2'), 'process stdout')
  })
})

describe.skip('benchmark', function () {
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
