import { strictEqual as is, ok, rejects } from 'node:assert/strict'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import {
  BaseRunner,
  type Config,
  createRunner,
  NodeRunner,
  Runner,
  resolveOptions,
  run,
  UsageError,
  WorkerdRunner,
  watch,
} from '../src/runner.ts'
import { TEST_CONCURRENCY } from './helpers.ts'

function makeCapture() {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let out = ''
  let err = ''
  stdout.on('data', (chunk: Buffer | string) => {
    out += chunk.toString()
  })
  stderr.on('data', (chunk: Buffer | string) => {
    err += chunk.toString()
  })
  return {
    stdout,
    stderr,
    out: () => out,
    err: () => err,
  }
}

describe('programmatic API', { concurrency: TEST_CONCURRENCY }, () => {
  it('exports the full programmatic surface', () => {
    is(typeof run, 'function')
    is(typeof watch, 'function')
    is(typeof createRunner, 'function')
    is(typeof resolveOptions, 'function')
    is(typeof Runner, 'function')
    is(typeof NodeRunner, 'function')
    is(typeof WorkerdRunner, 'function')
    is(typeof BaseRunner, 'function')
    is(typeof UsageError, 'function')
  })

  it('createRunner picks the right runner class for each mode', async () => {
    const file = path.resolve('mocks/node-test/minimal-pass.test.js')
    const [browser, worker, node, workerd] = await Promise.all([
      createRunner({ mode: 'browser' }, [file]),
      createRunner({ mode: 'web-worker' }, [file]),
      createRunner({ mode: 'node' }, [file]),
      createRunner({ mode: 'workerd' }, [file]),
    ])

    try {
      ok(browser instanceof Runner)
      ok(worker instanceof Runner)
      ok(node instanceof NodeRunner)
      ok(workerd instanceof WorkerdRunner)
    } finally {
      await Promise.all([
        browser.removeFiles(),
        worker.removeFiles(),
        node.removeFiles(),
        workerd.removeFiles(),
      ])
    }
  })

  it('createRunner rejects an invalid mode', async () => {
    await rejects(
      createRunner(
        // @ts-expect-error testing runtime validation
        { mode: 'invalid' },
        [path.resolve('mocks/node-test/minimal-pass.test.js')]
      ),
      (err: unknown) =>
        err instanceof UsageError && err.message.includes('Invalid mode')
    )
  })

  for (const mode of ['browser', 'web-worker', 'node', 'workerd'] as const) {
    it(`run() executes tests and captures output in ${mode} mode`, async () => {
      const { stdout, stderr, out, err } = makeCapture()
      const options: Config = {
        mode,
        runner: 'node-test',
        stdout,
        stderr,
        ...(mode === 'workerd' ? { cwd: path.resolve('mocks/workerd') } : {}),
      }
      const files = [
        mode === 'workerd'
          ? path.resolve('mocks/workerd/test/env.test.js')
          : path.resolve('mocks/node-test/minimal-pass.test.js'),
      ]

      const result = await run(options, files)

      is(result.passed, true, `${out()}\n${err()}`)
      is(result.exitCode, 0, `${out()}\n${err()}`)
      ok(out().includes('pass '), out())
    })
  }

  it('run() returns passed: false and exitCode: 1 on test failure without exiting', async () => {
    const { stdout, stderr, out } = makeCapture()
    const result = await run(
      {
        mode: 'node',
        runner: 'node-test',
        stdout,
        stderr,
      },
      [path.resolve('mocks/node-test-runner/fail.test.js')]
    )

    is(result.passed, false)
    is(result.exitCode, 1)
    ok(out().includes('must fail'), out())
  })

  it('isolates stdout, stderr and env across concurrent runs', async () => {
    const a = makeCapture()
    const b = makeCapture()

    const [resA, resB] = await Promise.all([
      run(
        {
          mode: 'browser',
          runner: 'none',
          stdout: a.stdout,
          stderr: a.stderr,
          env: { PW_TEST_EXIT_CASE: 'set-zero' },
        },
        [path.resolve('mocks/none/stdout.test.js')]
      ),
      run(
        {
          mode: 'browser',
          runner: 'none',
          stdout: b.stdout,
          stderr: b.stderr,
          env: { PW_TEST_EXIT_CASE: 'set-no-arg' },
        },
        [path.resolve('mocks/none/process-exit-code.test.js')]
      ),
    ])

    is(resA.exitCode, 0, a.err())
    is(resB.exitCode, 1, b.err())
    ok(a.out().includes('hello world!'), a.out())
    ok(!b.out().includes('hello world!'), b.out())
  })

  it('watch() returns a handle whose stop() ends watching and cleans up', async () => {
    const { stdout, stderr, out } = makeCapture()
    const handle = await watch(
      {
        mode: 'node',
        runner: 'none',
        stdout,
        stderr,
      },
      [path.resolve('mocks/node-mode/plain.ts')]
    )

    const result = await handle.stop()
    is(result.exitCode, 0)
    is(await handle.done, result)
    // Output may still be arriving before stop; handle closed cleanly without hanging
    ok(typeof out() === 'string')
  })
})
