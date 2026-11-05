import { describe, it } from 'node:test'
import { is, ok } from 'uvu/assert'
import { execa } from './helpers.js'

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
