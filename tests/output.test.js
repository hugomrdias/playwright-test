import { describe, it } from 'node:test'
import { execa } from 'execa'
import { is, ok } from 'uvu/assert'

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
