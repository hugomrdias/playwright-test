import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'fs'
import path from 'path'
import { execaSync, runCli } from './helpers.js'

describe('mocha', () => {
  it('basic', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--runner', 'mocha'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('fixtures', async () => {
    const proc = await runCli(['mocks/fixtures.mocha.js', '--runner', 'mocha'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('node', async () => {
    const proc = await runCli([
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
    const proc = await runCli([
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
    const proc = await runCli([
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
    const proc = await runCli(['mocks/test.mocha.js'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stderr.includes('Autodetected "mocha" as the runner'), proc.stderr)
  })

  it('coverage', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--cov'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')

    const cov = JSON.parse(
      fs.readFileSync('.nyc_output/coverage-pw.json', 'utf8')
    )
    ok(path.resolve('mocks/test.mocha.js') in cov, 'test coverage')
  })

  it('coverage with alternate report dir', async () => {
    const proc = await runCli([
      'mocks/test.mocha.js',
      '--cov',
      '--report-dir',
      '.coverage/mocha',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')

    const cov = JSON.parse(
      fs.readFileSync('.coverage/mocha/coverage-pw.json', 'utf8')
    )
    ok(path.resolve('mocks/test.mocha.js') in cov, 'test coverage')
  })

  it('cwd', async () => {
    const proc = await runCli(['test.mocha.js', '--cwd', path.resolve('mocks')])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('coverage with cwd', async () => {
    const proc = await runCli([
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
    const proc = await runCli(['mocks/test.mocha.js'], {
      env: { DEBUG: 'app' },
    })

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
    ok(proc.stdout.includes('app test pass'), 'debug output')
  })

  it('incognito', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--incognito'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('mode:worker', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--mode', 'worker'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('passing'), 'process stdout')
  })

  it('mocha extension', async () => {
    const proc = await runCli(['mocks/test.mocha.js', '--extension'])
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
    const proc = await runCli([
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
    const proc = await runCli([
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
    const proc = await runCli([
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
