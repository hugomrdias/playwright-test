import { test } from 'uvu'
import { is, ok } from 'uvu/assert'
import execa from 'execa'

test('mocha', async () => {
  const proc = await execa('./cli.js', ['mocks/test.mocha.js'])

  is(proc.exitCode, 0, 'exit code')
  ok(proc.stdout.includes('5 passing'), 'process stdout')
})

test('mocha with DEBUG=app', async () => {
  const proc = await execa('./cli.js', ['mocks/test.mocha.js'], {
    env: { DEBUG: 'app' },
  })

  is(proc.exitCode, 0, 'exit code')
  ok(proc.stdout.includes('5 passing'), 'process stdout')
  ok(proc.stdout.includes('app test pass'), 'debug output')
})

test('mocha incognito', async () => {
  const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--incognito'])

  is(proc.exitCode, 0, 'exit code')
  ok(proc.stdout.includes('5 passing'), 'process stdout')
})

test('mocha mode:worker', async () => {
  const proc = await execa('./cli.js', [
    'mocks/test.mocha.js',
    '--mode',
    'worker',
  ])

  is(proc.exitCode, 0, 'exit code')
  ok(proc.stdout.includes('5 passing'), 'process stdout')
})

test('mocha extension', async () => {
  const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--extension'])

  is(proc.exitCode, 0, 'exit code')
  ok(proc.stdout.includes('5 passing'), 'process stdout')
})

test('tape', async () => {
  const proc = await execa('./cli.js', [
    'mocks/test.tape.js',
    '--runner',
    'tape',
  ])

  is(proc.exitCode, 0, 'exit code')
  ok(proc.stdout.includes('# pass  5'), 'process stdout')
})

test('tape mode:worker', async () => {
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

test('zora', async () => {
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

test('zora mode:worker', async () => {
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

test.skip('benchmark', async () => {
  const proc = await execa('./cli.js', [
    'mocks/benchmark.js',
    '--runner',
    'benchmark',
  ])

  is(proc.exitCode, 0, 'exit code')
  ok(proc.stdout.includes('Fastest is String#indexOf'), 'process stdout')
})

test('sw', async () => {
  const proc = await execa('./cli.js', [
    'mocks/sw/sw-test.js',
    '--sw',
    'mocks/sw/sw.js',
    '--config',
    'mocks/sw/sw.config.js',
  ])

  is(proc.exitCode, 0, 'exit code')
})
test.run()
