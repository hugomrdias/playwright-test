import {
  deepStrictEqual as equal,
  strictEqual as is,
  match,
  ok,
} from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { nanoid } from 'nanoid'
import { execa, execaSync, runCli, TEST_CONCURRENCY } from './helpers.ts'

const FLOW = 'mocks/flow'

// An afterTests hook that outlasts the wait for the exit, 1s in node mode,
// without taking the 5.5s it needs for the default wait of the browsers
const SLOW_HOOK = {
  env: { FLOW_AFTER_DELAY: '1500', PW_TEST_EXIT_WAIT: '1000' },
}

interface RunOptions {
  all?: boolean
  forceKillAfterDelay?: false
  env?: Record<string, string | undefined>
  timeout?: number
}

function run(args: string[], options?: RunOptions) {
  return runCli(args, {
    // Fail here when nothing ends the run, instead of waiting for its timeout
    reject: false,
    timeout: 30_000,
    ...options,
  })
}

/**
 * If the process is still running. A zombie isn't, containers without an init
 * can leave killed processes like that.
 */
function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  const state = execaSync('ps', ['-o', 'stat=', '-p', String(pid)], {
    reject: false,
  }).stdout
  return !String(state).trim().startsWith('Z')
}

function runFlow(name: string, args: string[] = [], options: RunOptions = {}) {
  return run([`${FLOW}/${name}`, '--runner', 'none', ...args], options)
}

describe('runner flow', { concurrency: TEST_CONCURRENCY }, () => {
  describe('uncaught errors in the page', { concurrency: false }, () => {
    for (const mode of ['browser', 'web-worker']) {
      it(`fail a run where mocha passes with mode:${mode}`, async () => {
        const proc = await run([
          `${FLOW}/rejection.mocha.js`,
          '--runner',
          'mocha',
          '--mode',
          mode,
        ])

        is(proc.exitCode, 1, 'exit code')
        ok(proc.stderr.includes('rej-boom'), proc.stderr)
        ok(proc.stderr.includes('Tests failed.'), proc.stderr)
      })
    }
  })

  describe('--debug', { concurrency: false }, () => {
    it('prints why it can not start and exits', async () => {
      const proc = await runFlow('pass.js', ['--debug', '--browser', 'nope'], {
        timeout: 15_000,
      })

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes('Browser not supported: nope'), proc.stderr)
    })
  })

  describe('--debug in node mode', { concurrency: false }, () => {
    for (const [file, exitCode] of [
      ['pass.js', 0],
      ['exits-failing.js', 1],
    ]) {
      it(`ends with ${exitCode} and tells why`, async () => {
        const proc = await runFlow(
          file as string,
          ['--debug', '--mode', 'node'],
          { timeout: 15_000 }
        )

        is(proc.timedOut, false, 'ended by itself')
        is(proc.exitCode, exitCode, proc.stderr)
        is(proc.stderr.includes('Tests failed.'), exitCode === 1, proc.stderr)
      })
    }
  })

  describe('--sw', { concurrency: false }, () => {
    it('fails right away when the service worker throws', async () => {
      const proc = await runFlow('pass.js', ['--sw', `${FLOW}/sw-throws.js`])

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes('Failed to register'), proc.stderr)
      ok(!proc.stdout.includes('flow-pass'), 'the tests did not run')
    })

    it('leaves nothing with the environment in the temp folder', async () => {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-sw-'))
      try {
        const proc = await runFlow(
          'pass.js',
          ['--sw', `${FLOW}/sw-reports.js`],
          {
            env: { TEMP: temp, TMP: temp, TMPDIR: temp },
          }
        )

        is(proc.exitCode, 0, proc.stderr)
        // Node's compile cache is kept on purpose, it's shared by every run
        equal(
          fs.readdirSync(temp).filter((name) => name !== 'node-compile-cache'),
          [],
          'files left'
        )
      } finally {
        fs.rmSync(temp, { force: true, recursive: true })
      }
    })

    for (const browser of ['chromium', 'firefox', 'webkit']) {
      it(`starts the tests with the page controlled in ${browser}`, async () => {
        const proc = await runFlow(
          'sw-slow-claim.test.js',
          ['--sw', `${FLOW}/sw-slow-claim.js`, '--browser', browser],
          { env: { FLOW_SW_BLOCK: '1000' } }
        )

        is(proc.exitCode, 0, proc.stderr)
        ok(proc.stdout.includes('controlled:true'), proc.stdout)
      })
    }

    it('starts the tests when the page never gets controlled', async () => {
      const proc = await runFlow(
        'sw-slow-claim.test.js',
        ['--sw', `${FLOW}/sw-slow-claim.js`],
        {
          env: {
            FLOW_SW_BLOCK: '20000',
            PW_TEST_CONSOLE_FLUSH_TIMEOUT: '200',
            PW_TEST_SW_CLAIM_TIMEOUT: '500',
          },
        }
      )

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('controlled:false'), proc.stdout)
    })

    it('has the env, the console and stdout in the service worker', async () => {
      const proc = await runFlow(
        'sw-reports.test.js',
        ['--sw', `${FLOW}/sw-reports.js`],
        { env: { FLOW_ENV: 'flow-env-value' } }
      )

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('sw-env:flow-env-value'), proc.stdout)
      ok(proc.stdout.includes('sw-console'), proc.stdout)
      ok(proc.stdout.includes('sw-stdout'), proc.stdout)
    })

    it('works with an absolute path', async () => {
      const proc = await runFlow('pass.js', [
        '--sw',
        path.resolve(FLOW, 'sw-reports.js'),
      ])

      is(proc.exitCode, 0, proc.stderr)
    })
  })

  describe('env in the browser', { concurrency: false }, () => {
    const env = { FLOW_ENV: 'flow-env-value' }

    for (const args of [
      ['--mode', 'browser'],
      ['--mode', 'web-worker'],
      ['--extension'],
    ]) {
      it(`has the env and PW_SERVER with ${args.join(' ')}`, async () => {
        const proc = await runFlow('env.js', args, { env })

        is(proc.exitCode, 0, proc.stderr)
        ok(
          proc.stdout.includes('env:flow-env-value:undefined:true'),
          proc.stdout
        )
        ok(
          proc.stdout.includes('meta-env:flow-env-value:undefined:true'),
          proc.stdout
        )
      })
    }

    for (const mode of ['browser', 'web-worker']) {
      it(`has what beforeTests added to the env with mode:${mode}`, async () => {
        const proc = await runFlow(
          'env.js',
          ['--config', `${FLOW}/env.config.mjs`, '--mode', mode],
          { env }
        )

        is(proc.exitCode, 0, proc.stderr)
        ok(
          proc.stdout.includes('env:flow-env-value:from-before-tests:true'),
          proc.stdout
        )
        ok(
          proc.stdout.includes(
            'meta-env:flow-env-value:from-before-tests:true'
          ),
          proc.stdout
        )
      })
    }
  })

  for (const mode of ['browser', 'node']) {
    describe(`afterTests with mode:${mode}`, { concurrency: false }, () => {
      const runHook = (config: string, options?: RunOptions) =>
        runFlow(
          'pass.js',
          ['--config', `${FLOW}/${config}.config.mjs`, '--mode', mode],
          options
        )

      it('fails the run when it throws, without waiting', async () => {
        const start = Date.now()
        const proc = await runHook('after-throws')

        is(proc.exitCode, 1, 'exit code')
        ok(proc.stderr.includes('after-boom'), proc.stderr)
        // Far below the 60s afterTests wait, with room for slow CI browser startup
        ok(Date.now() - start < 20_000, 'it waited for the exit')
      })

      it('gets the time it needs', async () => {
        const proc = await runHook('after-slow', SLOW_HOOK)

        is(proc.exitCode, 0, proc.stderr)
        ok(proc.stderr.includes('after-finished'), proc.stderr)
      })

      it('fails the run when it never ends', async () => {
        const proc = await runHook('after-stuck', {
          env: { PW_TEST_AFTER_TESTS_TIMEOUT: '500' },
        })

        is(proc.timedOut, false, 'ended by itself')
        is(proc.exitCode, 1, 'exit code')
        ok(proc.stderr.includes('did not finish in 500ms'), proc.stderr)
      })

      it('runs after a beforeTests that is not async', async () => {
        const proc = await runHook('sync-hooks')

        is(proc.exitCode, 0, proc.stderr)
        ok(proc.stderr.includes('after-got:sync-before'), proc.stderr)
      })

      it('gets the env and what beforeTests returned', async () => {
        const proc = await runHook('hooks-output')

        is(proc.exitCode, 0, proc.stderr)
        ok(proc.stderr.includes('after-got:string:from-before'), proc.stderr)
      })

      it('does not run when beforeTests did not finish', async () => {
        const proc = await runHook('before-throws')

        is(proc.exitCode, 1, 'exit code')
        ok(proc.stderr.includes('before-boom'), proc.stderr)
        ok(!proc.stderr.includes('after-ran'), proc.stderr)
        ok(!proc.stderr.includes('afterTests hook failed'), proc.stderr)
      })
    })
  }

  describe('afterTests when stopped', { concurrency: false }, () => {
    for (const mode of ['browser', 'node']) {
      it(`waits for a beforeTests hook still running with mode:${mode}`, {
        skip: process.platform === 'win32',
      }, async () => {
        const running = runFlow('pass.js', [
          '--config',
          `${FLOW}/before-slow.config.mjs`,
          '--mode',
          mode,
        ])
        await once(running.stdout, 'data')
        running.kill('SIGINT')
        const proc = await running

        is(proc.exitCode, 130, proc.stderr)
        ok(proc.stderr.includes('before-finished'), proc.stderr)
        ok(proc.stderr.includes('after-ran'), proc.stderr)
      })
    }

    it('stops waiting when stopped twice with mode:node', {
      skip: process.platform === 'win32',
    }, async () => {
      const running = runFlow('never-ends.js', [
        '--config',
        `${FLOW}/after-slow.config.mjs`,
        '--mode',
        'node',
      ])
      await once(running.stdout, 'data')
      running.kill('SIGINT')
      await new Promise((resolve) => setTimeout(resolve, 500))
      running.kill('SIGINT')
      const proc = await running

      is(proc.exitCode, 130, proc.stderr)
      ok(!proc.stderr.includes('after-finished'), proc.stderr)
    })

    it('kills tests that ignore being stopped when stopped twice with mode:node', {
      skip: process.platform === 'win32',
    }, async () => {
      const running = runFlow('ignores-sigterm.js', ['--mode', 'node'])
      const [data] = await once(running.stdout, 'data')
      const pid = Number(String(data).match(/pid:(\d+)/)?.[1])
      running.kill('SIGINT')
      await new Promise((resolve) => setTimeout(resolve, 300))
      running.kill('SIGINT')
      const proc = await running

      is(proc.exitCode, 130, proc.stderr)
      // A forced kill still takes a moment to land
      let alive = isRunning(pid)
      for (let i = 0; i < 20 && alive; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        alive = isRunning(pid)
      }
      if (alive) {
        process.kill(pid, 'SIGKILL')
      }
      is(alive, false, 'the tests were still running')
    })

    it('kills tests that ignore being stopped with mode:node', {
      skip: process.platform === 'win32',
    }, async () => {
      const running = runFlow('ignores-sigterm.js', ['--mode', 'node'], {
        // It takes the 5s of the forced kill, execa would kill this run first
        forceKillAfterDelay: false,
      })
      const [data] = await once(running.stdout, 'data')
      const pid = Number(String(data).match(/pid:(\d+)/)?.[1])
      running.kill('SIGTERM')
      const proc = await running

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 143, proc.stderr)
      const alive = isRunning(pid)
      if (alive) {
        process.kill(pid, 'SIGKILL')
      }
      is(alive, false, 'the tests were still running')
    })

    // On Windows a killed process can't run any cleanup
    it('gets the time it needs when stopped', {
      skip: process.platform === 'win32',
    }, async () => {
      const running = runFlow(
        'never-ends.js',
        ['--config', `${FLOW}/after-slow.config.mjs`],
        SLOW_HOOK
      )
      await once(running.stdout, 'data')
      running.kill('SIGINT')
      const proc = await running

      is(proc.exitCode, 130, proc.stderr)
      ok(proc.stderr.includes('after-finished'), proc.stderr)
    })

    it('stops waiting when stopped twice', {
      skip: process.platform === 'win32',
    }, async () => {
      const running = runFlow('never-ends.js', [
        '--config',
        `${FLOW}/after-slow.config.mjs`,
      ])
      await once(running.stdout, 'data')
      running.kill('SIGINT')
      await new Promise((resolve) => setTimeout(resolve, 500))
      running.kill('SIGINT')
      const proc = await running

      is(proc.exitCode, 130, proc.stderr)
      ok(!proc.stderr.includes('after-finished'), proc.stderr)
    })
  })

  describe('paths', { concurrency: false }, () => {
    const created: string[] = []
    after(() => {
      for (const dir of created) {
        fs.rmSync(dir, { force: true, recursive: true })
      }
    })

    it('takes a relative --cwd', async () => {
      const proc = await run(['pass.js', '--runner', 'none', '--cwd', FLOW])

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('flow-pass'), proc.stdout)
    })

    for (const runner of ['mocha', 'node-test', 'none']) {
      it(`takes test files with quotes with --runner ${runner}`, async () => {
        const dir = `mocks/tmp-it's-${nanoid()}`
        created.push(dir)
        fs.mkdirSync(dir)
        fs.copyFileSync(`${FLOW}/pass.js`, `${dir}/a.test.js`)

        const proc = await run([`${dir}/a.test.js`, '--runner', runner])

        is(proc.exitCode, 0, proc.stderr)
        ok(proc.stdout.includes('flow-pass'), proc.stdout)
      })
    }

    for (const [name, className, file] of [
      ['browsers', 'Runner', '../src/runner.ts'],
      ['node mode', 'NodeRunner', '../src/node/runner.ts'],
    ]) {
      it(`throws without test files, before making a folder, in ${name}`, async () => {
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-no-tests-'))
        const script = `
        const { ${className}: Runner } = await import(${JSON.stringify(
          new URL(file, import.meta.url).href
        )})
        const { UsageError } = await import(${JSON.stringify(
          new URL('../src/utils/index.ts', import.meta.url).href
        )})
        try {
          new Runner({}, [])
        } catch (error) {
          console.log('usage:' + (error instanceof UsageError) + ':' + error.message)
        }
      `
        try {
          const proc = await execa(
            process.execPath,
            ['--input-type=module', '-e', script],
            { reject: false, env: { TMPDIR: temp, TEMP: temp, TMP: temp } }
          )

          ok(
            proc.stdout.includes('usage:true:No test files were found.'),
            proc.stdout + proc.stderr
          )
          equal(fs.readdirSync(temp), [], 'made a folder')
        } finally {
          fs.rmSync(temp, { recursive: true, force: true })
        }
      })
    }
  })

  describe('--runner none', { concurrency: false }, () => {
    it('runs a script like a benchmark', async () => {
      const proc = await run(['mocks/tinybench.js', '--runner', 'none'])

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('switch 1'), proc.stdout)
    })
  })

  describe('the runner classes', { concurrency: false }, () => {
    for (const [className, file] of [
      ['Runner', '../src/runner.ts'],
      ['NodeRunner', '../src/node/runner.ts'],
    ]) {
      const script = (options: string) => `
      const { ${className}: Runner } = await import(${JSON.stringify(
        new URL(file, import.meta.url).href
      )})
      const test = ${JSON.stringify(path.resolve(FLOW, 'config-runner.js'))}
      try {
        new Runner(${options}, [test]).run()
      } catch (error) {
        console.error(error.message)
        process.exit(1)
      }
    `
      const runScript = (options: string) =>
        execa(
          process.execPath,
          ['--input-type=module', '-e', script(options)],
          {
            reject: false,
            timeout: 30_000,
          }
        )
      const mode = className === 'Runner' ? 'browser' : 'node'

      it(`${className} takes the name of a runner`, async () => {
        const proc = await runScript(`{ runner: 'mocha', mode: '${mode}' }`)

        is(proc.exitCode, 0, String(proc.stderr))
        ok(
          String(proc.stdout).includes('from-config-runner'),
          String(proc.stdout)
        )
      })
    }

    for (const method of ['run', 'watch']) {
      it(`NodeRunner.${method}() stops cleanly when beforeTests throws`, async () => {
        const script = `
          const { NodeRunner } = await import(${JSON.stringify(
            new URL('../src/node/runner.ts', import.meta.url).href
          )})
          const { default: hooks } = await import(${JSON.stringify(
            new URL('../mocks/flow/before-throws.config.mjs', import.meta.url)
              .href
          )})
          const test = ${JSON.stringify(path.resolve(FLOW, 'pass.js'))}
          const runner = new NodeRunner({ runner: 'none', mode: 'node', ...hooks }, [test])
          try {
            await runner.${method}()
          } catch (error) {
            console.error('UNHANDLED:', error)
            process.exit(2)
          }
        `
        const proc = await execa(
          process.execPath,
          ['--input-type=module', '-e', script],
          {
            reject: false,
            timeout: 15_000,
          }
        )

        is(proc.timedOut, false, 'ended by itself')
        is(proc.exitCode, 1, 'exit code')
        ok(proc.stderr.includes('before-boom'), proc.stderr)
        ok(proc.stderr.includes('before-throws.config.mjs'), proc.stderr)
        ok(!proc.stderr.includes('UNHANDLED:'), proc.stderr)
        ok(!proc.stderr.includes('after-ran'), proc.stderr)
      })

      it(`NodeRunner.${method}() logs a diagnostic when beforeTests throws null`, async () => {
        const script = `
          const { NodeRunner } = await import(${JSON.stringify(
            new URL('../src/node/runner.ts', import.meta.url).href
          )})
          const test = ${JSON.stringify(path.resolve(FLOW, 'pass.js'))}
          const runner = new NodeRunner({
            runner: 'none',
            mode: 'node',
            beforeTests: () => Promise.reject(null),
            afterTests: () => {
              console.error('after-ran')
              return Promise.resolve()
            },
          }, [test])
          try {
            await runner.${method}()
          } catch (error) {
            console.error('UNHANDLED:', error)
            process.exit(2)
          }
        `
        const proc = await execa(
          process.execPath,
          ['--input-type=module', '-e', script],
          {
            reject: false,
            timeout: 15_000,
          }
        )

        is(proc.timedOut, false, 'ended by itself')
        is(proc.exitCode, 1, 'exit code')
        ok(proc.stderr.includes('null'), proc.stderr)
        ok(!proc.stderr.includes('UNHANDLED:'), proc.stderr)
        ok(!proc.stderr.includes('after-ran'), proc.stderr)
      })
    }
  })

  describe('messages', { concurrency: false }, () => {
    for (const mode of ['browser', 'web-worker', 'node']) {
      it(`prints nothing of its own on a passing run with mode:${mode}`, async () => {
        const proc = await runFlow('pass.js', ['--mode', mode])

        is(proc.exitCode, 0, proc.stderr)
        is(proc.stdout.trim(), 'flow-pass')
        is(proc.stderr, '')
      })
    }

    it('tells when a test navigates away', async () => {
      const proc = await runFlow('navigates.js')

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes('navigated away'), proc.stderr)
      ok(!proc.stderr.includes('TypeError'), proc.stderr)
    })

    // On Windows a killed process can't run any cleanup
    it('stays quiet about the browser closing when stopped', {
      skip: process.platform === 'win32',
    }, async () => {
      const running = runFlow('never-ends.js')
      await once(running.stdout, 'data')
      running.kill('SIGINT')
      const proc = await running

      is(proc.timedOut, false, 'ended by itself')
      ok(!proc.stderr.includes('has been closed'), proc.stderr)
    })

    const debugCases: [string, Record<string, string | undefined>, string][] = [
      ['without DEBUG', { DEBUG: undefined }, 'debug:-pw:*,-mocha:*'],
      ['with DEBUG', { DEBUG: 'app' }, 'debug:app,-pw:*,-mocha:*'],
    ]
    for (const [name, env, expected] of debugCases) {
      it(`sets localStorage.debug ${name}`, async () => {
        const proc = await runFlow('debug-env.js', [], { env })

        is(proc.exitCode, 0, proc.stderr)
        ok(proc.stdout.includes(expected), proc.stdout)
      })
    }
  })

  describe('process.stdout.write', { concurrency: false }, () => {
    for (const mode of ['browser', 'web-worker']) {
      it(`calls back and returns true with mode:${mode}`, async () => {
        const proc = await runFlow('stdout-callback.js', [
          '--mode',
          mode,
          '--run-timeout',
          '10000',
        ])

        is(proc.exitCode, 0, proc.stderr)
        ok(proc.stdout.includes('callback:true'), proc.stdout)
      })
    }
  })

  describe('console', { concurrency: false }, () => {
    for (const browser of ['chromium', 'firefox', 'webkit']) {
      it(`prints what the page logged in ${browser}`, async () => {
        const proc = await runFlow('console.js', ['--browser', browser], {
          env: { FORCE_COLOR: undefined },
        })
        const stdout = proc.stdout.split('\n')

        is(proc.exitCode, 0, proc.stderr)
        ok(proc.stderr.includes('Assertion failed: ASSERT-MSG'), proc.stderr)
        ok(!proc.stderr.includes('ASSERT-NOT-PRINTED'), proc.stderr)
        ok(stdout.includes('lbl: 1'), proc.stdout)
        match(proc.stderr, /Trace: TRACE-MSG\s+at .*flow\/console\.js:5:/)
        ok(!/src[/\\]utils/.test(proc.stderr), proc.stderr)
        ok(stdout.includes('  in-group'), proc.stdout)
        ok(stdout.includes('after-group'), proc.stdout)
        ok(stdout.includes('Map(1) { 1 => 2 }'), proc.stdout)
        ok(stdout.includes('Set(1) { 3 }'), proc.stdout)
        ok(stdout.includes('/x/g'), proc.stdout)
        ok(stdout.includes('{}'), proc.stdout)
        ok(stdout.includes('undefined'), proc.stdout)
        ok(
          stdout.includes('NULL-ARG null { deep: { a: { b: 1 } } }'),
          proc.stdout
        )
        ok(stdout.includes('null'), proc.stdout)
        ok(
          stdout.some((line) => line.startsWith('Symbol(')),
          proc.stdout
        )
        ok(
          stdout.some((line) => line.startsWith('() =>')),
          proc.stdout
        )
      })
    }

    it('prints the page while a worker is stuck', async () => {
      const proc = await runFlow('stuck-worker.js', [], {
        all: true,
        env: { PW_TEST_CONSOLE_FLUSH_TIMEOUT: '1000' },
      })
      const all = proc.all ?? ''
      const printed = all.indexOf('page-3')

      is(proc.exitCode, 0, all)
      ok(printed !== -1, all)
      ok(printed < all.indexOf('Timed out waiting'), all)
    })

    it('prints what the extension service worker logs once', async () => {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-ext-sw-'))
      const script = `
        const { Runner } = await import(${JSON.stringify(
          new URL('../src/runner.ts', import.meta.url).href
        )})
        const test = ${JSON.stringify(path.resolve(FLOW, 'pass.js'))}
        const runner = new Runner(
          {
            runner: 'none',
            extension: true,
            trace: 'on',
            cwd: ${JSON.stringify(temp)},
          },
          [test]
        )
        const setupPage = runner.setupPage.bind(runner)
        runner.setupPage = async (context) => {
          let [worker] = context.serviceWorkers()
          if (!worker) {
            worker = await context.waitForEvent('serviceworker')
          }
          await worker.evaluate(() => console.log('ext-sw-before-page'))
          const page = await setupPage(context)
          await worker.evaluate(() => console.log('ext-sw-after-page'))
          return page
        }
        await runner.run()
      `
      try {
        const proc = await execa(
          process.execPath,
          ['--input-type=module', '-e', script],
          { reject: false, timeout: 30_000 }
        )

        is(proc.exitCode, 0, proc.stderr)
        is(
          proc.stdout.match(/ext-sw-before-page/g)?.length,
          1,
          proc.stdout + proc.stderr
        )
        is(
          proc.stdout.match(/ext-sw-after-page/g)?.length,
          1,
          proc.stdout + proc.stderr
        )
      } finally {
        fs.rmSync(temp, { force: true, recursive: true })
      }
    })
  })

  describe('--watch', { concurrency: false }, () => {
    const root = `mocks/tmp-watch-${nanoid()}`
    const app = `${root}/app`
    const lib = `${app}/lib.js`
    const test = `${app}/a.test.js`
    const outside = `${root}/outside/lib.js`
    const hidden = `${app}/.hidden/lib.js`

    function write(v: string, o: string, h: string) {
      fs.writeFileSync(lib, `export const V = '${v}'\n`)
      fs.writeFileSync(outside, `export const O = '${o}'\n`)
      fs.writeFileSync(hidden, `export const H = '${h}'\n`)
    }

    after(() => {
      fs.rmSync(root, { force: true, recursive: true })
    })

    it('has the files to watch in watch mode', async () => {
      const { Runner } = await import('../src/runner.ts')
      const test = path.resolve(FLOW, 'imports-suffix.js')
      const runner = new Runner(
        { runner: 'none', buildConfig: { metafile: false } },
        [test]
      )
      runner.watching = true
      try {
        const { files } = await runner.compiler()
        ok(files.has(test), [...files].join('\n'))
        // Not with the suffix of the import
        ok(files.has(path.resolve(FLOW, 'pass.js')), [...files].join('\n'))
      } finally {
        runner.removeFiles()
      }
    })

    // On Windows a killed process can't run any cleanup
    it('starts no tests once stopped with mode:node', {
      skip: process.platform === 'win32',
    }, async () => {
      const dir = `${root}/stopped`
      fs.mkdirSync(dir, { recursive: true })
      const file = `${dir}/a.test.js`
      // Doesn't stay around for long if this breaks, nothing would stop it
      fs.writeFileSync(
        file,
        "console.log('STARTED')\nsetTimeout(() => process.exit(0), 15000)\n"
      )

      const proc = run(
        [
          'a.test.js',
          '--runner',
          'none',
          '--mode',
          'node',
          '--watch',
          '--cwd',
          dir,
          '--config',
          `${FLOW}/after-slow.config.mjs`,
        ],
        { env: { FLOW_AFTER_DELAY: '1000' } }
      )
      await once(proc.stdout, 'data')
      proc.kill('SIGINT')
      // While afterTests runs, the watcher takes a moment to report it
      await new Promise((resolve) => setTimeout(resolve, 300))
      fs.appendFileSync(file, '// changed\n')
      const { stderr, stdout } = await proc

      ok(stderr.includes('after-finished'), stderr)
      is(String(stdout).match(/STARTED/g)?.length, 1, String(stdout))
    })

    it('reruns once for what changed and keeps running', async () => {
      fs.mkdirSync(`${root}/outside`, { recursive: true })
      fs.mkdirSync(`${app}/.hidden`, { recursive: true })
      write('v1', 'o1', 'h1')
      fs.writeFileSync(
        test,
        `import { H } from './.hidden/lib.js'
import { V } from './lib.js'
import { O } from '../outside/lib.js'
console.log('RUN', V, O, H)
`
      )

      const proc = run(
        ['a.test.js', '--runner', 'none', '--watch', '--cwd', app],
        {
          timeout: 45_000,
        }
      )
      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (data) => {
        stdout += data
      })
      proc.stderr.on('data', (data) => {
        stderr += data
      })

      async function seen(line: string) {
        const start = Date.now()
        while (!stdout.includes(`RUN ${line}\n`)) {
          ok(
            Date.now() - start < 8000,
            `no "${line}" in:\n${stdout}\n${stderr}`
          )
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }

      try {
        await seen('v1 o1 h1')

        // Dot folders aren't watched
        fs.writeFileSync(hidden, "export const H = 'h2'\n")
        await new Promise((resolve) => setTimeout(resolve, 1500))
        ok(!stderr.includes('Reloading'), stderr)

        // A file outside of cwd, like in a monorepo
        fs.writeFileSync(outside, "export const O = 'o2'\n")
        await seen('v1 o2 h2')

        // Many files at once still rerun once
        for (const version of ['a', 'b', 'c']) {
          const runs = stderr.match(/Reloading/g)?.length ?? 0
          fs.writeFileSync(lib, `export const V = '${version}'\n`)
          fs.appendFileSync(test, '// changed\n')
          await seen(`${version} o2 h2`)
          // Give a second run the time to show up
          await new Promise((resolve) => setTimeout(resolve, 800))
          is(stderr.match(/Reloading/g)?.length ?? 0, runs + 1, stderr)
        }

        ok(!stderr.includes('Execution context'), stderr)
        ok(!stderr.includes('already been declared'), stderr)
        ok(!stderr.includes('has been closed'), stderr)
      } finally {
        // On Windows a kill doesn't reach its children, which keep the output open
        if (process.platform === 'win32') {
          await execa('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
            reject: false,
          })
        } else {
          proc.kill('SIGINT')
        }
        await proc
      }
    })
  })
})
