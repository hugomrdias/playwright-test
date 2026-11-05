import { describe, it } from 'node:test'
import { execa } from 'execa'
import { is, ok } from 'uvu/assert'

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
