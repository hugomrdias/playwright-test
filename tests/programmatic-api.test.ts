import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
  rejects,
} from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
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

  it('does not mutate host process.env.DEBUG when creating a browser runner', async () => {
    const before = process.env.DEBUG
    const runner = await createRunner({ mode: 'browser' }, [
      path.resolve('mocks/node-test/minimal-pass.test.js'),
    ])
    try {
      is(process.env.DEBUG, before)
    } finally {
      await runner.removeFiles()
    }
  })

  it('closes the asset server when NodeRunner.stop() runs during startup', async () => {
    const { stdout, stderr } = makeCapture()
    let beforeRan = false
    const runner = new NodeRunner(
      {
        mode: 'node',
        runner: 'none',
        stdout,
        stderr,
        beforeTests: () => {
          beforeRan = true
          return Promise.resolve()
        },
      },
      [path.resolve('mocks/node-mode/plain.ts')]
    )

    const running = runner.run()
    await runner.stop(false)
    await running

    is(runner.server?.listening ?? false, false, 'asset server closed')
    is(beforeRan, false, 'beforeTests skipped after stop')
    is(fs.existsSync(runner.dir), false, 'temp dir removed')
  })

  it('stops promptly on a stalled workerd bundle plugin without recreating the temp dir', async () => {
    const { stdout, stderr, err } = makeCapture()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const runner = new WorkerdRunner(
      {
        mode: 'workerd',
        runner: 'none',
        cwd: path.resolve('mocks/workerd'),
        runTimeout: 100,
        stdout,
        stderr,
        buildConfig: {
          plugins: [
            {
              name: 'stalled-start',
              setup(build) {
                build.onStart(async () => {
                  started.resolve()
                  await release.promise
                })
              },
            },
          ],
        },
      },
      [path.resolve('mocks/workerd/test/env.test.js')]
    )

    const running = runner.run()
    await started.promise
    const result = await running

    is(result.exitCode, 1)
    ok(err().includes('Run timed out after 100ms'), err())
    is(runner.server?.listening ?? false, false, 'asset server closed')
    is(fs.existsSync(runner.dir), false, 'temp dir removed')

    // Releasing the stalled plugin after shutdown must not recreate the temp dir
    release.resolve()
    await new Promise((resolve) => setTimeout(resolve, 150))
    is(fs.existsSync(runner.dir), false, 'temp dir stayed removed')
  })

  it('watch({ mode: "workerd" }) rejects without leaking a temp directory', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-watch-workerd-'))
    try {
      await rejects(
        watch(
          {
            mode: 'workerd',
            cwd: path.resolve('mocks/workerd'),
            env: { TMPDIR: temp, TEMP: temp, TMP: temp },
          },
          [path.resolve('mocks/workerd/test/env.test.js')]
        ),
        (err: unknown) =>
          err instanceof UsageError &&
          err.message.includes('--watch does not work in the workerd mode yet.')
      )
      equal(fs.readdirSync(temp), [])
    } finally {
      fs.rmSync(temp, { recursive: true, force: true })
    }
  })

  it('watch() waits until the file watcher is ready before returning', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-watch-ready-'))
    const file = path.join(dir, 'reloads.test.js')
    fs.writeFileSync(file, 'console.log("WATCH_V1")\n')
    const { stdout, stderr, out } = makeCapture()
    const seen = (needle: string) =>
      new Promise<void>((resolve, reject) => {
        if (out().includes(needle)) {
          resolve()
          return
        }
        const timer = setTimeout(() => {
          stdout.off('data', onData)
          reject(new Error(`Timed out waiting for ${needle} in:\n${out()}`))
        }, 10_000)
        const onData = () => {
          if (out().includes(needle)) {
            clearTimeout(timer)
            stdout.off('data', onData)
            resolve()
          }
        }
        stdout.on('data', onData)
      })

    const handle = await watch(
      {
        mode: 'node',
        runner: 'none',
        cwd: dir,
        stdout,
        stderr,
      },
      [file]
    )
    try {
      await seen('WATCH_V1')
      // Edit immediately after watch() resolves — the watcher must already be ready
      fs.writeFileSync(file, 'console.log("WATCH_V2")\n')
      await seen('WATCH_V2')
    } finally {
      await handle.stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('routes service-worker esbuild diagnostics and warnings to custom stderr', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sw-err-'))
    const badSw = path.join(dir, 'bad-sw.js')
    const okSw = path.join(dir, 'ok-sw.js')
    fs.writeFileSync(badSw, "import './does-not-exist.js'\n")
    fs.writeFileSync(okSw, '// empty sw\n')
    try {
      const failCap = makeCapture()
      const failed = await run(
        {
          mode: 'browser',
          runner: 'none',
          sw: badSw,
          stdout: failCap.stdout,
          stderr: failCap.stderr,
        },
        [path.resolve('mocks/none/stdout.test.js')]
      )

      is(failed.exitCode, 1)
      ok(failCap.err().includes('Could not resolve'), failCap.err())

      const warnCap = makeCapture()
      const warned = await run(
        {
          mode: 'browser',
          runner: 'none',
          sw: okSw,
          stdout: warnCap.stdout,
          stderr: warnCap.stderr,
          buildSWConfig: {
            plugins: [
              {
                name: 'warn-sw',
                setup(build) {
                  build.onStart(() => ({
                    warnings: [{ text: 'sw-plugin-warning' }],
                  }))
                },
              },
            ],
          },
        },
        [path.resolve('mocks/none/stdout.test.js')]
      )

      is(warned.exitCode, 0, warnCap.err())
      ok(warnCap.err().includes('sw-plugin-warning'), warnCap.err())
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
