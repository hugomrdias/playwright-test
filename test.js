import { test } from 'zora'
import execa from 'execa'

test('mocha', async (t) => {
  const proc = await execa('./cli.js', ['mocks/test.mocha.js'])

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('5 passing'), 'process stdout')
})

test('mocha with DEBUG=app', async (t) => {
  const proc = await execa('./cli.js', ['mocks/test.mocha.js'], {
    env: { DEBUG: 'app' },
  })

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('5 passing'), 'process stdout')
  t.ok(proc.stdout.includes('app test pass'), 'debug output')
})

test('mocha incognito', async (t) => {
  const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--incognito'])

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('5 passing'), 'process stdout')
})

test('mocha mode:worker', async (t) => {
  const proc = await execa('./cli.js', [
    'mocks/test.mocha.js',
    '--mode',
    'worker',
  ])

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('5 passing'), 'process stdout')
})

test('mocha extension', async (t) => {
  const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--extension'])

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('5 passing'), 'process stdout')
})

test('tape', async (t) => {
  const proc = await execa('./cli.js', [
    'mocks/test.tape.js',
    '--runner',
    'tape',
  ])

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('# pass  5'), 'process stdout')
})

test('tape mode:worker', async (t) => {
  const proc = await execa('./cli.js', [
    'mocks/test.tape.js',
    '--runner',
    'tape',
    '--mode',
    'worker',
  ])

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('# pass  5'), 'process stdout')
})

test('zora', async (t) => {
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

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('# success: 2'), 'process stdout')
})

test('zora mode:worker', async (t) => {
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

  t.is(proc.exitCode, 0, 'exit code')
  t.ok(proc.stdout.includes('# success: 2'), 'process stdout')
})

// test.skip('benchmark', async () => {
//   const proc = await execa('./cli.js', [
//     'mocks/benchmark.js',
//     '--runner',
//     'benchmark',
//   ])

//   is(proc.exitCode, 0, 'exit code')
//   ok(proc.stdout.includes('Fastest is String#indexOf'), 'process stdout')
// })

test('sw', async (t) => {
  const proc = await execa('./cli.js', [
    'mocks/sw/sw-test.js',
    '--sw',
    'mocks/sw/sw.js',
    '--config',
    'mocks/sw/sw.config.js',
  ])

  t.is(proc.exitCode, 0, 'exit code')
})
// test.run()
