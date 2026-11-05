import { describe, it } from 'node:test'
import { execa } from 'execa'
import { is, ok } from 'uvu/assert'

describe.skip('benchmark', () => {
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
