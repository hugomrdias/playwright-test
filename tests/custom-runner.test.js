import { describe, it } from 'node:test'
import { execa } from 'execa'
import { is, ok } from 'uvu/assert'

describe('custom runner', () => {
  it('module from file', async () => {
    const proc = await execa('./cli.js', [
      'mocks/tinybench.js',
      '--runner',
      './mocks/custom-runner.js',
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('Setup complete'), 'process stdout')
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

  it('names the module when it has no runner export', async () => {
    const proc = await execa(
      './cli.js',
      ['mocks/test.mocha.js', '--runner', './mocks/no-runner-export.js'],
      { reject: false }
    )

    is(proc.exitCode, 1, 'exit code')
    ok(
      proc.stderr.includes(
        'Cannot find playwrightTestRunner export in "./mocks/no-runner-export.js"'
      ),
      proc.stderr
    )
  })
})
