import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

/**
 * @param {string[]} args
 */
function runWorkerd(args) {
  return runCli(['--mode', 'workerd', '--cwd', 'mocks/workerd', ...args], {
    reject: false,
  })
}

describe('workerd mode', () => {
  it('runs node:test files in the worker of the wrangler config', async () => {
    const proc = await runWorkerd(['test/worker.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 5'), proc.stdout)
  })

  it('loads the worker with the env of the run', async () => {
    const proc = await runWorkerd(['test/env.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('starts the tests of a worker with static assets', async () => {
    const proc = await runWorkerd(['test/assets.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('imports text, data and wasm modules', async () => {
    const proc = await runWorkerd(['test/modules.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 3'), proc.stdout)
  })

  it('keeps configured vars over the env of this process', async () => {
    const proc = await runCli(
      [
        '--mode',
        'workerd',
        '--cwd',
        'mocks/workerd',
        'test/configured.test.js',
      ],
      {
        env: { CONFIGURED: 'from this process', NODE_TEST_CONTEXT: undefined },
        reject: false,
      }
    )

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('gets the env beforeTests sets', async () => {
    const proc = await runWorkerd([
      '--config',
      'mocks/workerd/before-tests.config.mjs',
      'test/before-tests.test.js',
    ])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('runs mocha files', async () => {
    const proc = await runWorkerd(['test/worker.mocha.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('1 passing'), proc.stdout)
  })

  it('runs without a wrangler config', async () => {
    const proc = await runCli(['--mode', 'workerd', 'mocks/node.test.js'], {
      reject: false,
    })

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('1 passing'), proc.stdout)
  })

  it('fails with stack traces of the test files', async () => {
    const proc = await runWorkerd(['test/fail.test.js'])
    const output = `${proc.stdout}\n${proc.stderr}`

    is(proc.exitCode, 1, output)
    ok(output.includes('test/fail.test.js:5:10'), output)
    ok(!output.includes('bundle-out.js'), output)
  })

  it('fails a test that never settles', async () => {
    const proc = await runWorkerd(['test/hang.test.js'])

    is(proc.exitCode, 1, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stderr.includes('had hung'), proc.stderr)
  })

  it('fails when the tests do not bundle', async () => {
    const proc = await runWorkerd(['test/missing-import.test.js'])

    is(proc.exitCode, 1, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stderr.includes('Could not resolve'), proc.stderr)
    ok(proc.stderr.includes('Could not bundle the tests.'), proc.stderr)
  })

  it('runs in the worker of a cloudflare.config.ts', async () => {
    const proc = await runCli(
      ['--mode', 'workerd', '--cwd', 'mocks/workerd-cf', 'test/worker.test.js'],
      { reject: false }
    )

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 4'), proc.stdout)
  })

  it('passes the environment as the mode of cloudflare.config.ts', async () => {
    const proc = await runCli(
      [
        '--mode',
        'workerd',
        '--cwd',
        'mocks/workerd-cf',
        '--config',
        'mocks/workerd-cf/staging.config.mjs',
        'test/worker.test.js',
      ],
      {
        env: { EXPECTED_MODE: 'staging', NODE_TEST_CONTEXT: undefined },
        reject: false,
      }
    )

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 4'), proc.stdout)
  })

  for (const cwd of ['mocks/workerd', 'mocks/workerd-cf']) {
    it(`merges Miniflare options over the config in ${cwd}`, async () => {
      const proc = await runCli(
        [
          '--mode',
          'workerd',
          '--cwd',
          cwd,
          '--config',
          'mocks/workerd/override.config.mjs',
          '../workerd/test/greeting.test.js',
        ],
        {
          env: {
            EXPECTED_GREETING: 'overridden',
            NODE_TEST_CONTEXT: undefined,
          },
          reject: false,
        }
      )

      is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
      ok(proc.stdout.includes('pass 1'), proc.stdout)
    })
  }

  it('does not record a trace', async () => {
    const proc = await runWorkerd(['test/worker.test.js', '--trace=on'])

    is(proc.exitCode, 1)
    ok(
      proc.stderr.includes('it does not work with --mode workerd.'),
      proc.stderr
    )
  })

  it('does not take browser only options', async () => {
    const proc = await runWorkerd(['test/worker.test.js', '--sw', 'sw.js'])

    is(proc.exitCode, 1)
    ok(
      proc.stderr.includes('--sw does not work in the workerd mode.'),
      proc.stderr
    )
  })
})
