import { strictEqual as is, ok, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UsageError } from '../src/utils/index.ts'
import { WorkerdRunner } from '../src/workerd/runner.ts'
import { runCli } from './helpers.ts'

function runWorkerd(
  args: string[],
  options?: { all?: boolean; env?: Record<string, string>; timeout?: number }
) {
  return runCli(['--mode', 'workerd', '--cwd', 'mocks/workerd', ...args], {
    reject: false,
    ...options,
  })
}

describe('workerd mode', () => {
  it('runs node:test files in the worker of cloudflare.config.ts', async () => {
    const proc = await runWorkerd(['test/worker.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 5'), proc.stdout)
  })

  it('loads the worker with the env of the run', async () => {
    const proc = await runWorkerd(['test/env.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('imports text, data and wasm modules', async () => {
    const proc = await runWorkerd(['test/modules.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 4'), proc.stdout)
  })

  it('bundles Node built-ins whose names contain digits', async () => {
    const proc = await runWorkerd(['test/builtins.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('preserves esbuild alias resolution for non-built-ins containing digits', async () => {
    const proc = await runWorkerd([
      '--config',
      'mocks/workerd/alias.config.mjs',
      'test/alias.test.js',
    ])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('keeps configured vars over the env of this process', async () => {
    const proc = await runWorkerd(['test/configured.test.js'], {
      env: { CONFIGURED: 'from this process' },
    })

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

  it('serves --assets to the worker', async () => {
    const proc = await runWorkerd(['--assets', 'src', 'test/server.test.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('runs mocha files', async () => {
    const proc = await runWorkerd(['test/worker.mocha.js'])

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('1 passing'), proc.stdout)
  })

  it('runs without a worker config', async () => {
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

  it('stops the worker before the afterTests hook on a run timeout', async () => {
    const proc = await runWorkerd(
      [
        '--config',
        'mocks/workerd/after-tests.config.mjs',
        '--runner',
        'none',
        '--run-timeout',
        '1000',
        'test/ticks.test.js',
      ],
      { all: true }
    )

    const all = proc.all ?? ''
    is(proc.exitCode, 1, all)
    ok(all.includes('Run timed out after 1000ms'), all)
    ok(all.includes('tick'), all)
    const hook = all.slice(all.indexOf('after-started'))
    ok(hook.includes('after-finished'), all)
    ok(!hook.includes('tick'), all)
  })

  it('fails when the tests do not bundle', async () => {
    const proc = await runWorkerd(['test/missing-import.test.js'])

    is(proc.exitCode, 1, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stderr.includes('Could not resolve'), proc.stderr)
    ok(proc.stderr.includes('Could not bundle the tests.'), proc.stderr)
  })

  it('passes the environment as the mode of cloudflare.config.ts', async () => {
    const proc = await runWorkerd(
      ['--config', 'mocks/workerd/staging.config.mjs', 'test/mode.test.js'],
      {
        env: { EXPECTED_MODE: 'staging' },
      }
    )

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('merges Miniflare options over the config', async () => {
    const proc = await runWorkerd(
      [
        '--config',
        'mocks/workerd/override.config.mjs',
        'test/greeting.test.js',
      ],
      {
        env: { EXPECTED_GREETING: 'overridden' },
      }
    )

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })

  it('does not record a trace', async () => {
    const proc = await runWorkerd(['test/worker.test.js', '--trace=on'])

    is(proc.exitCode, 1)
    ok(
      proc.stderr.includes('it does not work with --mode workerd.'),
      proc.stderr
    )
  })

  it('rejects trace when constructing WorkerdRunner directly', () => {
    for (const trace of ['on', 'retain-on-failure'] as const) {
      throws(
        () =>
          new WorkerdRunner(
            {
              cwd: 'mocks/workerd',
              runner: 'node-test',
              trace,
            },
            ['test/worker.test.js']
          ),
        (err: unknown) =>
          err instanceof UsageError &&
          err.message.includes('it does not work with --mode workerd.')
      )
    }
  })

  it('does not stall shutdown when an asset server request stays active', async () => {
    const proc = await runWorkerd(
      [
        '--config',
        'mocks/workerd/open-connection.config.mjs',
        'test/env.test.js',
      ],
      {
        env: {
          PW_TEST_AFTER_TESTS_TIMEOUT: '15000',
        },
        timeout: 12_000,
      }
    )

    is(proc.timedOut, false, 'exited before the exit-hook deadline')
    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('pass 1'), proc.stdout)
  })
})
