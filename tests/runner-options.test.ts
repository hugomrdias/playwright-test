import { strictEqual as is, ok } from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import type { Result } from 'execa'
import { runCli, TEST_CONCURRENCY } from './helpers.ts'

describe('runner options', () => {
  const fixture = (name: string) => `mocks/runner-options/${name}.js`

  const run = (name: string, args: string[]) =>
    runCli([fixture(name), ...args], { reject: false })

  const output = (proc: Result) => `${proc.stdout}\n${proc.stderr}`

  const patterns: [string, string[]][] = [
    ['alpha', ['alpha one', 'alpha two']],
    ['/ALPHA/i', ['alpha one', 'alpha two']],
    ['^suite a beta$', ['beta']],
    ['suite a', ['alpha one', 'beta']],
    ['suite a beta', ['beta']],
    // mocha only matches the full title
    ['^beta$', []],
    ['does not match', []],
  ]

  for (const mode of ['node', 'browser']) {
    describe(`--mode ${mode}`, { concurrency: TEST_CONCURRENCY }, () => {
      // node:test patterns are in node-test-runner.test.ts
      for (const [pattern, expected] of patterns) {
        it(`mocha --test-name-pattern ${pattern}`, async () => {
          const proc = await run('mocha', [
            '--runner',
            'mocha',
            '--mode',
            mode,
            '--test-name-pattern',
            pattern,
          ])

          is(proc.exitCode, 0, output(proc))
          for (const name of ['alpha one', 'beta', 'alpha two']) {
            is(
              proc.stdout.includes(name),
              expected.includes(name),
              `${name} in:\n${proc.stdout}`
            )
          }
        })
      }

      it('mocha with --test-name-pattern twice runs what matches any', async () => {
        const proc = await run('mocha', [
          '--runner',
          'mocha',
          '--mode',
          mode,
          '--test-name-pattern',
          'alpha one',
          '--test-name-pattern',
          '/ALPHA TWO/i',
        ])

        is(proc.exitCode, 0, output(proc))
        for (const [name, expected] of [
          ['alpha one', true],
          ['beta', false],
          ['alpha two', true],
        ] as const) {
          is(
            proc.stdout.includes(name),
            expected,
            `${name} in:\n${proc.stdout}`
          )
        }
      })

      it('mocha --test-timeout', async () => {
        const args = ['--runner', 'mocha', '--mode', mode]
        const [failed, passed] = await Promise.all([
          run('mocha-slow', [...args, '--test-timeout', '50']),
          run('mocha-slow', [...args, '--test-timeout', '2000']),
        ])

        is(failed.exitCode, 1, output(failed))
        is(passed.exitCode, 0, output(passed))
      })
    })
  }

  describe('testRunner.options in the config file', {
    concurrency: TEST_CONCURRENCY,
  }, () => {
    const config = ['--config', 'mocks/runner-options/no-bail.config.js']
    const mode = ['--mode', 'node']

    it('applies to the runner from --runner', async () => {
      const [bail, noBail] = await Promise.all([
        run('mocha-fails', ['--runner', 'mocha', ...mode]),
        run('mocha-fails', ['--runner', 'mocha', ...mode, ...config]),
      ])

      is(bail.exitCode, 1, output(bail))
      ok(!bail.stdout.includes('runs without bail'), output(bail))
      is(noBail.exitCode, 1, output(noBail))
      ok(noBail.stdout.includes('runs without bail'), output(noBail))
    })

    it('applies to the autodetected runner', async () => {
      const proc = await run('mocha-fails', [...mode, ...config])

      ok(proc.stderr.includes('Autodetected "mocha"'), proc.stderr)
      is(proc.exitCode, 1, output(proc))
      ok(proc.stdout.includes('runs without bail'), output(proc))
    })
  })

  describe('test timeout limits', { concurrency: TEST_CONCURRENCY }, () => {
    it('--test-timeout accepts 0 and 2 ** 31 - 2 and applies them in mocha', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-timeout-'))
      const file = path.join(dir, 'timeout.test.js')
      try {
        fs.writeFileSync(
          file,
          `it('reports timeout', function () {
  console.log('EFFECTIVE_TIMEOUT:' + this.timeout())
})
`
        )
        for (const timeout of ['0', String(2 ** 31 - 2)]) {
          const proc = await runCli(
            [
              file,
              '--runner',
              'mocha',
              '--mode',
              'node',
              '--test-timeout',
              timeout,
            ],
            { reject: false }
          )

          is(proc.exitCode, 0, output(proc))
          ok(proc.stdout.includes(`EFFECTIVE_TIMEOUT:${timeout}`), output(proc))
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
