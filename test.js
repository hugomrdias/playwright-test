import fs from 'fs'
import path from 'path'
import { ok, is } from 'uvu/assert'
import { execa, execaSync } from 'execa'

describe('mocha', function () {
  it('basic', async () => {
    const proc = await execa('./cli.js', [
      'mocks/test.mocha.js',
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

  it('auto detect', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Autodetected'), proc.stdout)
  })

  it('coverage', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--cov'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')

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
    ok(proc.stdout.includes('passing'), 'process stdout')

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
    ok(
      proc.stdout.includes(
        '[playwright-test] Autodetected "tape" as the runner.'
      ),
      'process stdout'
    )
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

  it('autodetect', async () => {
    const proc = await execa('./cli.js', ['mocks/*.zora.js'], {
      env: {
        ZORA_ONLY: 'true',
      },
    })

    is(proc.exitCode, 0, 'exit code')
    ok(
      proc.stdout.includes(
        '[playwright-test] Autodetected "zora" as the runner.'
      ),
      'process stdout'
    )
  })

  it('zora mode:worker', async () => {
    const proc = await execa(
      './cli.js',
      ['mocks/*.zora.js', '--runner', 'zora', '--mode', 'worker'],
      {
        env: {
          ZORA_ONLY: 'true',
          INDENT: 'true',
        },
      }
    )

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('# pass  2'), 'process stdout')
  })
})

describe('uvu', () => {
  it('basic', async () => {
    const proc = await execa('./cli.js', ['mocks/uvu', '--runner', 'uvu'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Skipped:   0'), 'process stdout')
  })

  it('autodetect', async () => {
    const proc = await execa('./cli.js', ['mocks/uvu'])

    is(proc.exitCode, 0, 'exit code')
    ok(
      proc.stdout.includes(
        '[playwright-test] Autodetected "uvu" as the runner.'
      ),
      'process stdout'
    )
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

describe('custom runner', function () {
  it('module from file', async () => {
    const proc = await execa('./cli.js', [
      'mocks/tinybench.js',
      '--runner',
      'mocks/custom-runner.js',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Task Name'), 'process stdout')
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

describe('taps', function () {
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
