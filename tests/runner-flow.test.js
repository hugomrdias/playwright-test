import { strictEqual as is, match, ok } from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { nanoid } from 'nanoid'
import { execa, runCli } from './helpers.js'

const FLOW = 'mocks/flow'

/**
 * @typedef {{ all?: boolean, env?: Record<string, string | undefined>, timeout?: number }} RunOptions
 */

/**
 * @param {string[]} args
 * @param {RunOptions} [options]
 * @returns {import('execa').ResultPromise<{ reject: false }>}
 */
function run(args, options) {
  return /** @type {any} */ (
    runCli(args, {
      // Fail here when nothing ends the run, instead of waiting for its timeout
      reject: false,
      timeout: 30_000,
      ...options,
    })
  )
}

/**
 * @param {string} name
 * @param {string[]} [args]
 * @param {RunOptions} [options]
 */
function runFlow(name, args = [], options = {}) {
  return run([`${FLOW}/${name}`, '--runner', 'none', ...args], options)
}

describe('uncaught errors in the page', () => {
  for (const mode of ['main', 'worker']) {
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

describe('--debug', () => {
  it('prints why it can not start and exits', async () => {
    const proc = await runFlow('pass.js', ['--debug', '--browser', 'nope'], {
      timeout: 15_000,
    })

    is(proc.timedOut, false, 'ended by itself')
    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Browser not supported: nope'), proc.stderr)
  })
})

describe('--debug in node mode', () => {
  for (const [file, exitCode] of [
    ['pass.js', 0],
    ['exits-failing.js', 1],
  ]) {
    it(`ends with ${exitCode} and tells why`, async () => {
      const proc = await runFlow(
        /** @type {string} */ (file),
        ['--debug', '--mode', 'node'],
        { timeout: 15_000 }
      )

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, exitCode, proc.stderr)
      is(proc.stderr.includes('Tests failed.'), exitCode === 1, proc.stderr)
    })
  }
})

describe('--sw', () => {
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
      const proc = await runFlow('pass.js', ['--sw', `${FLOW}/sw-reports.js`], {
        env: { TEMP: temp, TMP: temp, TMPDIR: temp },
      })

      is(proc.exitCode, 0, proc.stderr)
      is(fs.readdirSync(temp).length, 0, 'files left')
    } finally {
      fs.rmSync(temp, { force: true, recursive: true })
    }
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

describe('--before', () => {
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    it(`keeps what the script stored in ${browser}`, async () => {
      const proc = await runFlow('before-storage.test.js', [
        '--before',
        `${FLOW}/before-storage.js`,
        '--browser',
        browser,
      ])

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('storage:1:fromBefore=1'), proc.stdout)
    })
  }

  it('works with an absolute path', async () => {
    const proc = await runFlow('pass.js', [
      '--before',
      path.resolve(FLOW, 'before-storage.js'),
    ])

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes('flow-pass'), proc.stdout)
  })
})

describe('afterTests', () => {
  for (const mode of ['main', 'node']) {
    describe(`with mode:${mode}`, () => {
      /**
       * @param {string} config
       * @param {RunOptions} [options]
       */
      const runHook = (config, options) =>
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
        ok(Date.now() - start < 5000, 'it waited for the exit')
      })

      it('gets the time it needs', async () => {
        const proc = await runHook('after-slow')

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

  // On Windows a killed process can't run any cleanup
  it('gets the time it needs when stopped', {
    skip: process.platform === 'win32',
  }, async () => {
    const running = runFlow('never-ends.js', [
      '--config',
      `${FLOW}/after-slow.config.mjs`,
    ])
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

describe('paths', () => {
  /** @type {string[]} */
  const created = []
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
    ['browsers', 'Runner', '../src/runner.js'],
    ['node mode', 'NodeRunner', '../src/node/runner.js'],
  ]) {
    it(`does not create a folder without test files in ${name}`, async () => {
      const script = `
        import fs from 'node:fs'
        const { ${className}: Runner } = await import(${JSON.stringify(
          new URL(file, import.meta.url).href
        )})
        const runner = new Runner({}, [])
        await runner.run()
        console.log('folder:' + fs.existsSync(runner.dir))
      `
      const proc = await execa(
        process.execPath,
        ['--input-type=module', '-e', script],
        { reject: false }
      )

      ok(proc.stdout.includes('folder:false'), proc.stdout + proc.stderr)
    })
  }
})

describe('--runner none', () => {
  it('runs a script like a benchmark', async () => {
    const proc = await run(['mocks/tinybench.js', '--runner', 'none'])

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes('switch 1'), proc.stdout)
  })
})

describe('runner in the config file', () => {
  const file = `${FLOW}/config-runner.js`
  const config = ['--config', `${FLOW}/runner-mocha.config.mjs`]

  it('picks the runner, without auto detection', async () => {
    const proc = await run([file, ...config])

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes('from-config-runner'), proc.stdout)
    ok(!proc.stderr.includes('Autodetected'), proc.stderr)
    ok(!proc.stderr.includes('Could not find'), proc.stderr)
  })

  it('applies in node mode', async () => {
    const proc = await run([file, ...config, '--mode', 'node'])

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes('from-config-runner'), proc.stdout)
  })

  it('loses to --runner', async () => {
    const proc = await run([file, ...config, '--runner', 'none'])

    // `none` has no describe for the file to call
    is(proc.exitCode, 1, 'exit code')
    ok(!proc.stdout.includes('from-config-runner'), proc.stdout)
  })

  it('rejects anything else', async () => {
    const proc = await run([
      file,
      '--config',
      `${FLOW}/runner-unknown.config.mjs`,
    ])

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Unknown runner "nope"'), proc.stderr)
  })
})

describe('the runner classes', () => {
  for (const [className, file] of [
    ['Runner', '../src/runner.js'],
    ['NodeRunner', '../src/node/runner.js'],
  ]) {
    /**
     * @param {string} options
     */
    const script = (options) => `
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
    /**
     * @param {string} options
     */
    const runScript = (options) =>
      execa(process.execPath, ['--input-type=module', '-e', script(options)], {
        reject: false,
        timeout: 30_000,
      })
    const mode = className === 'Runner' ? 'main' : 'node'

    it(`${className} takes the name of a runner`, async () => {
      const proc = await runScript(`{ runner: 'mocha', mode: '${mode}' }`)

      is(proc.exitCode, 0, String(proc.stderr))
      ok(
        String(proc.stdout).includes('from-config-runner'),
        String(proc.stdout)
      )
    })

    if (className === 'Runner') {
      it('Runner rejects the mode it does not run', async () => {
        const proc = await runScript(`{ mode: 'node' }`)

        is(proc.exitCode, 1, 'exit code')
        ok(
          String(proc.stderr).includes(
            'Invalid mode "node", this runner takes "main" or "worker".'
          ),
          String(proc.stderr)
        )
      })
    }

    it(`${className} rejects a custom runner`, async () => {
      const proc = await runScript(
        `{ testRunner: { compileRuntime: () => '' }, mode: '${mode}' }`
      )

      is(proc.exitCode, 1, 'exit code')
      ok(
        String(proc.stderr).includes('Custom test runners are not'),
        String(proc.stderr)
      )
    })

    it(`${className} rejects an unknown runner`, async () => {
      const proc = await runScript(`{ runner: 'nope', mode: '${mode}' }`)

      is(proc.exitCode, 1, 'exit code')
      ok(
        String(proc.stderr).includes('Unknown runner "nope"'),
        String(proc.stderr)
      )
    })
  }
})

describe('custom test runners', () => {
  for (const name of ['./mocks/flow/pass.js', 'some-module', 'toString']) {
    it(`rejects --runner ${name}`, async () => {
      const proc = await run([`${FLOW}/pass.js`, '--runner', name])

      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes(`Unknown runner "${name}"`), proc.stderr)
    })
  }

  it('rejects one in the config file', async () => {
    const proc = await run([
      `${FLOW}/pass.js`,
      '--config',
      `${FLOW}/custom-runner.config.mjs`,
    ])

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Custom test runners are not'), proc.stderr)
    ok(!proc.stdout.includes('flow-pass'), proc.stdout)
  })
})

describe('invalid options', () => {
  for (const [name, args, message] of [
    ['a mode', ['--mode', 'nope'], 'Invalid mode "nope"'],
    [
      'an extension in another browser',
      ['--extension', '--browser', 'firefox'],
      'only supported in chromium',
    ],
    [
      'an extension in incognito',
      ['--extension', '--incognito'],
      'does not work with incognito',
    ],
  ]) {
    it(`rejects ${name} before starting a browser`, async () => {
      const proc = await runFlow('pass.js', /** @type {string[]} */ (args))

      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes(/** @type {string} */ (message)), proc.stderr)
      ok(!proc.stderr.includes('    at '), 'only the message')
    })
  }
})

describe('messages', () => {
  for (const mode of ['main', 'worker', 'node']) {
    it(`prints nothing of its own on a passing run with mode:${mode}`, async () => {
      const proc = await runFlow('pass.js', ['--mode', mode])

      is(proc.exitCode, 0, proc.stderr)
      is(proc.stdout.trim(), 'flow-pass')
      is(proc.stderr, '')
    })
  }

  it('still says when the tests failed', async () => {
    const proc = await run([`${FLOW}/rejection.mocha.js`, '--runner', 'mocha'])

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Tests failed.'), proc.stderr)
  })

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

  for (const [name, env, expected] of [
    ['without DEBUG', { DEBUG: undefined }, 'debug:-pw:*,-mocha:*'],
    ['with DEBUG', { DEBUG: 'app' }, 'debug:app,-pw:*,-mocha:*'],
  ]) {
    it(`sets localStorage.debug ${name}`, async () => {
      const proc = await runFlow('debug-env.js', [], {
        env: /** @type {any} */ (env),
      })

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes(/** @type {string} */ (expected)), proc.stdout)
    })
  }
})

describe('process.stdout.write', () => {
  for (const mode of ['main', 'worker']) {
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

describe('console', () => {
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    it(`prints what the page logged in ${browser}`, async () => {
      const proc = await runFlow('console.js', ['--browser', browser])
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
    const proc = /** @type {any} */ (
      await runFlow('stuck-worker.js', [], {
        all: true,
        env: { PW_TEST_CONSOLE_FLUSH_TIMEOUT: '1000' },
      })
    )
    const printed = proc.all.indexOf('page-3')

    is(proc.exitCode, 0, proc.all)
    ok(printed !== -1, proc.all)
    ok(printed < proc.all.indexOf('Timed out waiting'), proc.all)
  })
})

describe('--watch', () => {
  const root = `mocks/tmp-watch-${nanoid()}`
  const app = `${root}/app`
  const lib = `${app}/lib.js`
  const test = `${app}/a.test.js`
  const outside = `${root}/outside/lib.js`
  const hidden = `${app}/.hidden/lib.js`

  /**
   * @param {string} v
   * @param {string} o
   * @param {string} h
   */
  function write(v, o, h) {
    fs.writeFileSync(lib, `export const V = '${v}'\n`)
    fs.writeFileSync(outside, `export const O = '${o}'\n`)
    fs.writeFileSync(hidden, `export const H = '${h}'\n`)
  }

  after(() => {
    fs.rmSync(root, { force: true, recursive: true })
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

    const proc = run([
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
    ])
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

    /**
     * @param {string} line
     */
    async function seen(line) {
      const start = Date.now()
      while (!stdout.includes(`RUN ${line}\n`)) {
        ok(Date.now() - start < 8000, `no "${line}" in:\n${stdout}\n${stderr}`)
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

      // Many files at once, which used to break the reloads or the whole process
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
      proc.kill('SIGINT')
      await proc
    }
  })
})
