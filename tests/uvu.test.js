import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

describe('uvu', () => {
  it('basic', async () => {
    const proc = await runCli(['mocks/uvu', '--runner', 'uvu'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Skipped:   0'), 'process stdout')
  })

  it('node', async () => {
    const proc = await runCli([
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
    const proc = await runCli(['mocks/uvu'])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stderr.includes('Autodetected "uvu" as the runner'), proc.stderr)
  })

  it('mode:worker', async () => {
    const proc = await runCli([
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
