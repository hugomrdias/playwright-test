import { ok, strictEqual as is } from 'assert'
import execa from 'execa'

describe('mocha', function () {
  it('basic', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('5 passing'), 'process stdout')
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
          RUN_ONLY: 'true',
          INDENT: 'true',
        },
      }
    )

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('# success: 2'), 'process stdout')
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
    ok(proc.stdout.includes('# success: 2'), 'process stdout')
  })
})

describe('benchmark', function () {
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
