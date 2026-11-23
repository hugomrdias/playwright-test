import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
  rejects,
  throws,
} from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NodeRunner } from '../src/node/runner.ts'
import { Runner } from '../src/runner.ts'
import { UsageError } from '../src/utils/index.ts'
import { WorkerdRunner } from '../src/workerd/runner.ts'
import { resolveCli, runCli } from './helpers.ts'

// What the cli does with its flags and the config file, without a run. The
// runs these options lead to are in the other files.

const FLOW = 'mocks/flow'
const MOCHA = 'mocks/runner-options/mocha.js'

const usageError = (message: string) => (error: unknown) =>
  error instanceof UsageError && error.message.includes(message)

/**
 * The runner the cli would start, it checks the options it cares about.
 */
async function createRunner(args: string[]) {
  const { options, testFiles } = await resolveCli(args)
  if (options.mode === 'node') {
    return new NodeRunner(options, testFiles)
  }
  if (options.mode === 'workerd') {
    return new WorkerdRunner(options, testFiles)
  }
  return new Runner(options, testFiles)
}

async function rejectsRunner(args: string[], message: string) {
  await rejects(createRunner(args), usageError(message), args.join(' '))
}

describe('cli flags', () => {
  it('keeps files after boolean flags', async () => {
    const { options, testFiles } = await resolveCli([
      '--debug',
      'mocks/config/where.js',
      '--runner',
      'none',
    ])

    is(options.debug, true)
    equal(options.input, ['mocks/config/where.js'])
    is(testFiles.length, 1)
  })

  it('--test-name-pattern takes a numeric pattern as a string', async () => {
    const { options } = await resolveCli([
      MOCHA,
      '--mode',
      'node',
      '--test-name-pattern',
      '123',
    ])

    is(options.testNamePattern, '123')
  })

  it('--trace alone keeps the trace of failed runs', async () => {
    const { options } = await resolveCli([MOCHA, '--trace'])

    is(options.trace, 'retain-on-failure')
  })

  it('--watch', async () => {
    is((await resolveCli([MOCHA])).watch, false)
    is((await resolveCli([MOCHA, '--watch'])).watch, true)
  })

  it('none warns the test options are ignored', async () => {
    const { logs } = await resolveCli([
      'mocks/none/stdout.test.js',
      '--runner',
      'none',
      '--mode',
      'node',
      '--test-name-pattern',
      'a',
      '--test-timeout',
      '100',
    ])

    ok(logs.includes('ignoring --test-name-pattern'), logs)
    ok(logs.includes('ignoring --test-timeout'), logs)
  })
})

describe('cli usage errors', () => {
  it('the cli prints only the message', async () => {
    const proc = await runCli([MOCHA, '--mode', 'node', '--grep', 'a'], {
      reject: false,
    })

    is(proc.exitCode, 1, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stderr.includes('Unknown option --grep'), proc.stderr)
    ok(!proc.stderr.includes('    at '), proc.stderr)
    ok(!proc.stdout.includes('alpha one'), proc.stdout)
  })

  const invalid: [string, string[], string][] = [
    // Mocha flags, next to the ones that replace them
    ['--grep is an unknown option', ['--grep', 'a'], 'Unknown option --grep'],
    [
      '--timeout is an unknown option',
      ['--timeout', '100'],
      'Unknown option --timeout',
    ],
    // Removed in v16
    [
      '--extension is an unknown option',
      ['--extension'],
      'Unknown option --extension',
    ],
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
    ['--test-timeout without a value', ['--test-timeout'], 'must be a number'],
    ...['soon', '-1', '1.5', '2147483648'].map(
      (value) =>
        [
          `--run-timeout ${value}`,
          [`--run-timeout=${value}`],
          'Invalid run timeout',
        ] as [string, string[], string]
    ),
    [
      '--trace with node mode',
      ['--trace', '--mode', 'node'],
      '--trace records the browser, it does not work with --mode node.',
    ],
    ['a mode', ['--mode', 'nope'], 'Invalid mode "nope"'],
  ]

  for (const [name, args, message] of invalid) {
    it(name, async () => {
      await rejects(resolveCli([MOCHA, ...args]), usageError(message))
    })
  }

  it('--trace with a value it does not know', async () => {
    await rejects(
      resolveCli(['--trace', MOCHA]),
      usageError(
        `Invalid --trace "${MOCHA}", expected "on", "off" or "retain-on-failure".`
      )
    )
  })
})

describe('runner in the config file', () => {
  const file = `${FLOW}/config-runner.js`
  const config = ['--config', `${FLOW}/runner-mocha.config.mjs`]

  it('picks the runner, without auto detection', async () => {
    for (const mode of ['browser', 'node']) {
      const { options, logs } = await resolveCli([
        file,
        ...config,
        '--mode',
        mode,
      ])

      is(options.runner, 'mocha')
      ok(!logs.includes('Autodetected'), logs)
      ok(!logs.includes('Could not find'), logs)
    }
  })

  it('loses to --runner', async () => {
    const { options } = await resolveCli([file, ...config, '--runner', 'none'])

    is(options.runner, 'none')
  })

  it('rejects anything else', async () => {
    await rejectsRunner(
      [file, '--config', `${FLOW}/runner-unknown.config.mjs`],
      'Unknown runner "nope"'
    )
  })
})

describe('options the runners reject', () => {
  for (const name of ['./mocks/flow/pass.js', 'some-module', 'toString']) {
    it(`--runner ${name}`, async () => {
      await rejectsRunner(
        [`${FLOW}/pass.js`, '--runner', name],
        `Unknown runner "${name}"`
      )
    })
  }

  for (const mode of ['browser', 'node', 'workerd']) {
    it(`the removed extension option in the config file with --mode ${mode}`, async () => {
      await rejectsRunner(
        [
          `${FLOW}/pass.js`,
          '--config',
          `${FLOW}/extension.config.mjs`,
          '--mode',
          mode,
        ],
        'The extension option was removed in v16'
      )
    })
  }

  it('a custom runner in the config file', async () => {
    await rejectsRunner(
      [`${FLOW}/pass.js`, '--config', `${FLOW}/custom-runner.config.mjs`],
      'Custom test runners are not'
    )
  })

  it('browser only options in workerd mode', async () => {
    await rejectsRunner(
      [
        '--mode',
        'workerd',
        '--cwd',
        'mocks/workerd',
        'test/worker.test.js',
        '--sw',
        'sw.js',
      ],
      '--sw does not work in the workerd mode.'
    )
  })
})

describe('the runner classes', () => {
  const test = `${FLOW}/config-runner.js`

  for (const [name, RunnerClass, mode] of [
    ['Runner', Runner, 'browser'],
    ['NodeRunner', NodeRunner, 'node'],
  ] as const) {
    it(`${name} rejects a custom runner`, () => {
      throws(
        () =>
          new RunnerClass(
            // @ts-expect-error not a runner it takes
            { testRunner: { compileRuntime: () => '' }, mode },
            [test]
          ),
        usageError('Custom test runners are not')
      )
    })

    it(`${name} rejects an unknown runner`, () => {
      throws(
        // @ts-expect-error not a runner it takes
        () => new RunnerClass({ runner: 'nope', mode }, [test]),
        usageError('Unknown runner "nope"')
      )
    })
  }

  it('Runner rejects the mode it does not run', () => {
    throws(
      () => new Runner({ mode: 'node' }, [test]),
      usageError(
        'Invalid mode "node", this runner takes "browser" or "web-worker".'
      )
    )
  })
})
