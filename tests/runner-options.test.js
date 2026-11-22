import { strictEqual as is, ok } from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { execa, runCli, TEST_CONCURRENCY } from './helpers.js'

describe('runner options', () => {
  const fixture = (/** @type {string} */ name) =>
    `mocks/runner-options/${name}.js`

  /**
   * @param {string} name
   * @param {string[]} args
   */
  const run = (name, args) =>
    runCli([fixture(name), ...args], { reject: false })

  /**
   * @param {import('execa').Result} proc
   */
  const output = (proc) => `${proc.stdout}\n${proc.stderr}`

  /** @type {Array<[string, string[]]>} */
  const patterns = [
    ['alpha', ['alpha one', 'alpha two']],
    ['/ALPHA/i', ['alpha one', 'alpha two']],
    ['^suite a beta$', ['beta']],
    ['suite a', ['alpha one', 'beta']],
    ['suite a beta', ['beta']],
    // mocha only matches the full title
    ['^beta$', []],
    ['does not match', []],
  ]

  for (const mode of ['node', 'main']) {
    describe(`--mode ${mode}`, { concurrency: TEST_CONCURRENCY }, () => {
      // node:test patterns are in node-test-runner.test.js
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

      it('mocha --test-timeout', async () => {
        const args = ['--runner', 'mocha', '--mode', mode]
        const [failed, passed] = await Promise.all([
          run('mocha-slow', [...args, '--test-timeout', '50']),
          run('mocha-slow', [...args, '--test-timeout', '2000']),
        ])

        is(failed.exitCode, 1, output(failed))
        is(passed.exitCode, 0, output(passed))
      })

      it('from the config file, and the cli wins', async () => {
        const args = ['--runner', 'mocha', '--mode', mode]
        const config = ['--config', 'mocks/runner-options/pattern.config.js']
        const [fromConfig, fromCli] = await Promise.all([
          run('mocha', [...args, ...config]),
          run('mocha', [
            ...args,
            ...config,
            '--test-name-pattern',
            'alpha two',
          ]),
        ])

        ok(fromConfig.stdout.includes('beta'), output(fromConfig))
        ok(!fromConfig.stdout.includes('alpha one'), output(fromConfig))
        ok(fromCli.stdout.includes('alpha two'), output(fromCli))
        ok(!fromCli.stdout.includes('beta'), output(fromCli))
      })
    })
  }

  it('none warns they are ignored', async () => {
    const proc = await runCli(
      [
        'mocks/none/stdout.test.js',
        '--runner',
        'none',
        '--mode',
        'node',
        '--test-name-pattern',
        'a',
        '--test-timeout',
        '100',
      ],
      { reject: false }
    )

    ok(proc.stderr.includes('ignoring --test-name-pattern'), proc.stderr)
    ok(proc.stderr.includes('ignoring --test-timeout'), proc.stderr)
  })

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

  describe('errors', { concurrency: TEST_CONCURRENCY }, () => {
    // Mocha flags, next to the ones that replace them
    const cases = [
      ['--grep', 'a'],
      ['--timeout', '100'],
    ]
    for (const args of cases) {
      it(`${args[0]} is an unknown option`, async () => {
        const proc = await run('mocha', ['--mode', 'node', ...args])

        is(proc.exitCode, 1, output(proc))
        ok(proc.stderr.includes(`Unknown option ${args[0]}`), proc.stderr)
        ok(!proc.stdout.includes('alpha one'), proc.stdout)
      })
    }

    /** @type {Array<[string, string[], string]>} */
    const invalid = [
      [
        '--test-name-pattern twice',
        ['--test-name-pattern', 'a', '--test-name-pattern', 'b'],
        'only be set once',
      ],
      [
        '--test-name-pattern without a value',
        ['--test-name-pattern'],
        'non-empty pattern',
      ],
      [
        '--test-name-pattern followed by another flag',
        ['--test-name-pattern', '--runner', 'mocha'],
        'non-empty pattern',
      ],
      [
        'an empty --test-name-pattern',
        ['--test-name-pattern='],
        'non-empty pattern',
      ],
      [
        'an invalid --test-name-pattern',
        ['--test-name-pattern', '('],
        'Invalid --test-name-pattern',
      ],
      [
        '--test-timeout that is not a number',
        ['--test-timeout', 'soon'],
        'must be a number',
      ],
      ['a negative --test-timeout', ['--test-timeout=-1'], 'must be a number'],
      [
        'a non-integer --test-timeout',
        ['--test-timeout', '1.5'],
        'must be a number',
      ],
      [
        '--test-timeout at 2 ** 31 - 1 (disables mocha timeouts)',
        ['--test-timeout', String(2 ** 31 - 1)],
        'must be a number',
      ],
      [
        '--test-timeout without a value',
        ['--test-timeout'],
        'must be a number',
      ],
    ]
    for (const [name, args, message] of invalid) {
      it(name, async () => {
        const proc = await run('mocha', ['--mode', 'node', ...args])

        is(proc.exitCode, 1, output(proc))
        ok(proc.stderr.includes(message), proc.stderr)
        ok(!proc.stderr.includes('    at '), proc.stderr)
      })
    }

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

    it('--test-name-pattern accepts a numeric pattern as a string', async () => {
      const proc = await run('mocha', [
        '--mode',
        'node',
        '--test-name-pattern',
        '123',
      ])

      is(proc.exitCode, 0, output(proc))
      ok(!proc.stdout.includes('alpha one'), proc.stdout)
    })

    it('the flags the cli does know still parse', async () => {
      const proc = await run('mocha', ['--mode', 'node', '--no-transform'])

      is(proc.exitCode, 0, output(proc))
    })
  })
})
