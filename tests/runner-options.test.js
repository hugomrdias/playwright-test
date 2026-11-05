import { describe, it } from 'node:test'
import { is, ok } from 'uvu/assert'
import { execa } from './helpers.js'

describe('runner options', () => {
  const fixture = (/** @type {string} */ name) =>
    `mocks/runner-options/${name}.js`

  /**
   * @param {string} name
   * @param {string[]} args
   */
  const run = (name, args) =>
    execa('./cli.js', [fixture(name), ...args], { reject: false })

  /**
   * @param {import('execa').Result} proc
   */
  const output = (proc) => `${proc.stdout}\n${proc.stderr}`

  /** @type {Array<[string, string[]]>} */
  const patterns = [
    ['alpha', ['alpha one', 'alpha two']],
    ['/ALPHA/i', ['alpha one', 'alpha two']],
    ['alpha|beta', ['alpha one', 'beta', 'alpha two']],
    ['beta$', ['beta']],
    ['^suite a beta$', ['beta']],
    ['suite a', ['alpha one', 'beta']],
    ['suite a beta', ['beta']],
    ['does not match', []],
  ]

  for (const mode of ['node', 'main']) {
    describe(`--mode ${mode}`, () => {
      for (const runner of ['mocha', 'taps']) {
        // mocha only matches the full title, the others also a single name
        /** @type {[string, string[]]} */
        const ownName = ['^beta$', runner === 'mocha' ? [] : ['beta']]
        for (const [pattern, expected] of [...patterns, ownName]) {
          it(`${runner} --test-name-pattern ${pattern}`, async () => {
            const proc = await run(runner, [
              '--runner',
              runner,
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
      }

      it('mocha --test-timeout', async () => {
        const args = ['--runner', 'mocha', '--mode', mode]
        const failed = await run('mocha-slow', [
          ...args,
          '--test-timeout',
          '50',
        ])
        const passed = await run('mocha-slow', [
          ...args,
          '--test-timeout',
          '2000',
        ])

        is(failed.exitCode, 1, output(failed))
        is(passed.exitCode, 0, output(passed))
      })

      it('taps --test-timeout, tests with their own keep it', async () => {
        const args = ['--runner', 'taps', '--mode', mode]
        const failed = await run('taps-slow', [...args, '--test-timeout', '50'])
        const passed = await run('taps-slow', [...args, '--test-timeout', '0'])

        is(failed.exitCode, 1, output(failed))
        ok(failed.stdout.includes('1 failing'), output(failed))
        ok(failed.stdout.includes('1 passing'), output(failed))
        is(passed.exitCode, 0, output(passed))
      })

      it('from the config file, and the cli wins', async () => {
        const args = ['--runner', 'mocha', '--mode', mode]
        const config = ['--config', 'mocks/runner-options/pattern.config.js']
        const fromConfig = await run('mocha', [...args, ...config])
        const fromCli = await run('mocha', [
          ...args,
          ...config,
          '--test-name-pattern',
          'alpha two',
        ])

        ok(fromConfig.stdout.includes('beta'), output(fromConfig))
        ok(!fromConfig.stdout.includes('alpha one'), output(fromConfig))
        ok(fromCli.stdout.includes('alpha two'), output(fromCli))
        ok(!fromCli.stdout.includes('beta'), output(fromCli))
      })
    })
  }

  for (const [runner, file] of [
    ['tape', 'mocks/test2.tape.js'],
    ['none', 'mocks/none/stdout.test.js'],
  ]) {
    it(`${runner} warns they are ignored`, async () => {
      const proc = await execa(
        './cli.js',
        [
          file,
          '--runner',
          runner,
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
  }

  describe('testRunner.options in the config file', () => {
    const config = ['--config', 'mocks/runner-options/no-bail.config.js']
    const mode = ['--mode', 'node']

    it('applies to the runner from --runner', async () => {
      const bail = await run('mocha-fails', ['--runner', 'mocha', ...mode])
      const noBail = await run('mocha-fails', [
        '--runner',
        'mocha',
        ...mode,
        ...config,
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

  describe('errors', () => {
    const cases = [
      ['--grep', 'a'],
      ['--bail'],

      ['--timeout', '100'],
      ['--reporter', 'tap'],
      ['--ui', 'tdd'],
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
    ]
    for (const [name, args, message] of invalid) {
      it(name, async () => {
        const proc = await run('mocha', ['--mode', 'node', ...args])

        is(proc.exitCode, 1, output(proc))
        ok(proc.stderr.includes(message), proc.stderr)
        ok(!proc.stderr.includes('    at '), proc.stderr)
      })
    }

    it('the flags the cli does know still parse', async () => {
      const proc = await run('mocha', [
        '--mode',
        'node',
        '--no-transform',
        '--cov',
        '--report-dir',
        '.coverage/runner-options',
      ])

      is(proc.exitCode, 0, output(proc))
    })
  })
})
