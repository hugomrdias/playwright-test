import { strictEqual as is, ok } from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import type { Result } from 'execa'
import { execa, runCli, TEST_CONCURRENCY } from './helpers.ts'

// --test-isolation process in node mode for the runners that don't have it,
// node-test is in node-test-runner.test.ts
const dir = 'mocks/isolation'
const output = (proc: Result) => `${proc.stdout}\n${proc.stderr}`

function run(
  runner: string,
  files: string[],
  args: string[] = [],
  env: Record<string, string> = {}
) {
  return runCli(
    [
      ...files.map((file) => `${dir}/${file}.test.js`),
      '--runner',
      runner,
      '--mode',
      'node',
      ...args,
    ],
    { reject: false, env }
  )
}

describe('--test-isolation process in node mode', {
  concurrency: TEST_CONCURRENCY,
}, () => {
  for (const runner of ['mocha', 'none']) {
    it(`${runner} runs each file on its own, by default`, async () => {
      const [isolated, together] = await Promise.all([
        run(runner, [`${runner}-a`, `${runner}-b`]),
        run(
          runner,
          [`${runner}-a`, `${runner}-b`],
          ['--test-isolation', 'none']
        ),
      ])

      is(isolated.exitCode, 0, output(isolated))
      ok(isolated.stdout.includes('ℹ files 2'), output(isolated))
      ok(isolated.stdout.includes('ℹ pass 2'), output(isolated))
      is(together.exitCode, 1, output(together))
      ok(!together.stdout.includes('ℹ files'), output(together))
    })
  }

  it('prints each file in the order of the files, also with --test-concurrency', async () => {
    const procs = await Promise.all(
      ['1', '2'].map((concurrency) =>
        run('none', ['order-1', 'order-2'], ['--test-concurrency', concurrency])
      )
    )

    for (const proc of procs) {
      is(proc.exitCode, 0, output(proc))
      ok(
        proc.stdout.indexOf('ORDER 1') < proc.stdout.indexOf('ORDER 2'),
        proc.stdout
      )
      ok(proc.stderr.includes('ORDER 1 on stderr'), proc.stderr)
    }
  })

  it('a single file prints no summary of the files', async () => {
    const proc = await run('none', ['order-2'])

    is(proc.exitCode, 0, output(proc))
    ok(!proc.stdout.includes('ℹ files'), proc.stdout)
  })

  it('fails when a file fails, and names it', async () => {
    const proc = await run('mocha', ['mocha-a', 'mocha-fails'])

    is(proc.exitCode, 1, output(proc))
    ok(proc.stdout.includes('ℹ fail 1'), output(proc))
    ok(
      // In the separators of the platform, like the files node:test names
      proc.stdout.includes(
        `✖ failing files:\n  ${path.join(dir, 'mocha-fails.test.js')}`
      ),
      output(proc)
    )
  })

  it('mocha bail ends the other files', async () => {
    const files = ['mocha-fails', 'mocha-slow']
    const [bail, noBail] = await Promise.all([
      run('mocha', files, ['--test-concurrency', '2']),
      run('mocha', files, [
        '--test-concurrency',
        '2',
        '--config',
        'mocks/runner-options/no-bail.config.js',
      ]),
    ])

    is(bail.exitCode, 1, output(bail))
    ok(!bail.stdout.includes('SLOW FINISHED'), output(bail))
    ok(bail.stdout.includes('ℹ cancelled 1'), output(bail))
    is(noBail.exitCode, 1, output(noBail))
    ok(noBail.stdout.includes('SLOW FINISHED'), output(noBail))
    ok(noBail.stdout.includes('ℹ cancelled 0'), output(noBail))
  })

  it('a file ended by bail is cancelled, even if it exits with 0', {
    // taskkill ends it without running its SIGTERM handler
    skip: process.platform === 'win32',
  }, async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-isolation-'))
    const proc = await run(
      'mocha',
      ['mocha-fails-later', 'mocha-sigterm'],
      ['--test-concurrency', '2'],
      { PW_TEST_READY: path.join(temp, 'ready') }
    )
    fs.rmSync(temp, { force: true, recursive: true })

    is(proc.exitCode, 1, output(proc))
    ok(proc.stdout.includes('SIGTERM HANDLED'), output(proc))
    ok(proc.stdout.includes('ℹ pass 0'), output(proc))
    ok(proc.stdout.includes('ℹ cancelled 1'), output(proc))
  })

  it('mocha prints all of its output before it exits', async () => {
    const proc = await run(
      'mocha',
      ['mocha-big', 'mocha-a'],
      ['--test-concurrency', '2']
    )

    is(proc.exitCode, 0, output(proc))
    ok(proc.stdout.includes('MOCHA BIG END'), proc.stdout.slice(-2000))
  })

  it('mocha fails the file when stdout stays corked', async () => {
    for (const isolation of ['process', 'none']) {
      const proc = await run(
        'mocha',
        ['mocha-corked'],
        ['--test-isolation', isolation]
      )

      is(proc.exitCode, 1, `${isolation}\n${output(proc)}`)
    }
  })

  it('mocha .only filters its own file, all of them with none', async () => {
    const files = ['mocha-only', 'mocha-fails']
    const [isolated, together] = await Promise.all([
      run('mocha', files),
      run('mocha', files, ['--test-isolation', 'none']),
    ])

    is(isolated.exitCode, 1, output(isolated))
    is(together.exitCode, 0, output(together))
  })

  it('a run timeout ends every file', async () => {
    const proc = await run(
      'mocha',
      ['mocha-slow', 'mocha-a'],
      ['--test-concurrency', '2', '--run-timeout', '500']
    )

    is(proc.exitCode, 1, output(proc))
    ok(proc.stderr.includes('Run timed out'), output(proc))
    ok(!proc.stdout.includes('SLOW FINISHED'), output(proc))
  })
})

// A page per file, also for web workers: each one starts its worker in a page
// of its own
const runIn = (
  mode: string,
  runner: string,
  files: string[],
  args: string[] = [],
  env: Record<string, string> = {}
) =>
  runCli(
    [
      ...files.map((file) => `${dir}/${file}.test.js`),
      '--runner',
      runner,
      '--mode',
      mode,
      ...args,
    ],
    { reject: false, env }
  )

describe('--watch', () => {
  it('reruns without the storage of the run before', async () => {
    // In the project, watching all of the temp folder takes a long while
    const temp = fs.mkdtempSync(path.join(dir, 'watch-'))
    const file = path.join(temp, 'storage.test.js')
    fs.writeFileSync(
      file,
      `describe('watch storage', () => {
  it('starts clean', () => {
    console.log('STORED ' + localStorage.getItem('watch'))
    localStorage.setItem('watch', 'old')
  })
})
`
    )
    const running = runCli([file, '--runner', 'mocha', '--watch'], {
      reject: false,
      timeout: 40_000,
    })
    let stdout = ''
    const stored = (count: number) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (stdout.split('STORED ').length > count) {
            running.stdout?.off('data', onData)
            resolve()
          }
        }
        const onData = (data: Buffer) => {
          stdout += data.toString()
          check()
        }
        running.stdout?.on('data', onData)
        check()
      })
    try {
      await stored(1)
      // Until it reruns, the watcher starts after the tests are loaded. Slower
      // than it waits for the writes to finish.
      const change = setInterval(() => {
        fs.appendFileSync(file, '// changed\n')
      }, 1500)
      await stored(2).finally(() => clearInterval(change))
    } finally {
      // On Windows a kill doesn't reach its children, which keep the output open
      if (process.platform === 'win32') {
        await execa('taskkill', ['/pid', String(running.pid), '/T', '/F'], {
          reject: false,
        })
      } else {
        running.kill()
      }
      await running
      fs.rmSync(temp, { recursive: true, force: true })
    }

    is(stdout.match(/STORED \w+/g)?.join(), 'STORED null,STORED null', stdout)
  })
})

for (const mode of ['browser', 'web-worker']) {
  describe(`--test-isolation process in ${mode} mode`, {
    concurrency: TEST_CONCURRENCY,
  }, () => {
    for (const [runner, prefix] of [
      ['mocha', 'mocha'],
      ['node-test', 'node-test'],
    ]) {
      it(`${runner} runs each file in a page of its own, by default`, async () => {
        const files = [`${prefix}-a`, `${prefix}-b`]
        const [isolated, together] = await Promise.all([
          runIn(mode, runner, files, ['--test-concurrency', '2']),
          runIn(mode, runner, files, ['--test-isolation', 'none']),
        ])

        is(isolated.exitCode, 0, output(isolated))
        ok(isolated.stdout.includes('ℹ files 2'), output(isolated))
        ok(isolated.stdout.includes('ℹ pass 2'), output(isolated))
        is(together.exitCode, 1, output(together))
        ok(!together.stdout.includes('ℹ files'), output(together))
      })
    }

    it('prints each file in the order of the files', async () => {
      const procs = await Promise.all(
        ['1', '2'].map((concurrency) =>
          runIn(
            mode,
            'mocha',
            ['page-order-1', 'page-order-2'],
            ['--test-concurrency', concurrency]
          )
        )
      )

      for (const proc of procs) {
        is(proc.exitCode, 0, output(proc))
        const at = (text: string) => proc.stdout.indexOf(text)
        // Both from the console and from process.stdout
        const first = Math.max(at('PAGE ORDER 1\n'), at('PAGE ORDER 1 written'))
        const second = Math.min(
          at('PAGE ORDER 2\n'),
          at('PAGE ORDER 2 written')
        )
        ok(at('PAGE ORDER 1\n') !== -1, proc.stdout)
        ok(first < second, proc.stdout)
      }
    })

    it('fails when a file fails, and names it', async () => {
      // One at a time, bail would end mocha-a when it's still loading
      const proc = await runIn(
        mode,
        'mocha',
        ['mocha-a', 'mocha-fails'],
        ['--test-concurrency', '1']
      )

      is(proc.exitCode, 1, output(proc))
      ok(proc.stdout.includes('ℹ pass 1'), output(proc))
      ok(
        proc.stdout.includes(
          `✖ failing files:\n  ${path.join(dir, 'mocha-fails.test.js')}`
        ),
        output(proc)
      )
    })

    it('mocha bail ends the other files', async () => {
      const proc = await runIn(
        mode,
        'mocha',
        ['bail-fails-later', 'mocha-slow'],
        ['--test-concurrency', '2']
      )

      is(proc.exitCode, 1, output(proc))
      ok(proc.stdout.includes('ℹ cancelled 1'), output(proc))
      ok(!proc.stdout.includes('SLOW FINISHED'), output(proc))
    })

    // Workers have no localStorage
    it('files share the storage of the run, like files share the disk', {
      skip: mode === 'web-worker',
    }, async () => {
      const proc = await runIn(
        mode,
        'mocha',
        ['storage-1', 'storage-2'],
        ['--test-concurrency', '1']
      )

      is(proc.exitCode, 0, output(proc))
    })

    it('runs with a publicPath in buildConfig', async () => {
      const proc = await runIn(
        mode,
        'mocha',
        ['mocha-a', 'mocha-b'],
        ['--config', `${dir}/public-path.config.js`]
      )

      is(proc.exitCode, 0, output(proc))
      ok(proc.stdout.includes('ℹ pass 2'), output(proc))
    })

    it('mocha bail ends a file that keeps its thread busy', async () => {
      // It blocks for 20s, the run ends after the console flush gives up on it.
      // The slow file still answers, it ends right away.
      const started = Date.now()
      const proc = await runIn(
        mode,
        'mocha',
        ['bail-fails-later', 'mocha-busy', 'mocha-slow'],
        ['--test-concurrency', '3']
      )

      is(proc.exitCode, 1, output(proc))
      ok(proc.stdout.includes('ℹ cancelled 2'), output(proc))
      ok(!proc.stdout.includes('BUSY FINISHED'), output(proc))
      ok(!proc.stdout.includes('SLOW FINISHED'), output(proc))
      ok(Date.now() - started < 15_000, output(proc))
    })

    it('a service worker of the tests never answers for the test page', async () => {
      // It serves an app shell to every page, the second file loads after it
      const proc = await runIn(
        mode,
        'mocha',
        ['mocha-a', 'mocha-b'],
        ['--test-concurrency', '1', '--sw', `${dir}/sw-app-shell.js`]
      )

      is(proc.exitCode, 0, output(proc))
      ok(proc.stdout.includes('ℹ pass 2'), output(proc))
    })

    it('a service worker of the tests still answers for their iframes', {
      skip: mode === 'web-worker',
    }, async () => {
      // Workers have no iframes. The second file loads with the worker there.
      const proc = await runIn(
        mode,
        'mocha',
        ['mocha-a', 'sw-iframe'],
        ['--test-concurrency', '1', '--sw', `${dir}/sw-app-shell.js`]
      )

      is(proc.exitCode, 0, output(proc))
      ok(proc.stdout.includes('ℹ pass 2'), output(proc))
    })

    // Firefox lets a navigation wait for the task the page runs
    for (const browser of ['chromium', 'firefox']) {
      it(`mocha bail keeps what a cancelled file logged, and ends it in ${browser}`, async () => {
        // Its thread is busy when bail ends it, the value can't be read
        // anymore. It calls the server after its busy loop, if it gets there.
        let calls = 0
        const server = http.createServer((_, res) => {
          calls++
          res.end()
        })
        await new Promise<void>((resolve) =>
          server.listen(0, '127.0.0.1', resolve)
        )
        const { port } = server.address() as AddressInfo
        try {
          const proc = await runIn(
            mode,
            'mocha',
            ['bail-fails-later', 'mocha-logs-busy'],
            ['--test-concurrency', '2', '--browser', browser],
            { PW_TEST_BEACON: `http://127.0.0.1:${port}/` }
          )

          is(proc.exitCode, 1, output(proc))
          ok(proc.stdout.includes('ℹ cancelled 1'), output(proc))
          // The preview of the value, Chromium's has its keys
          ok(
            proc.stdout.includes(
              browser === 'chromium' ? 'request: ' : 'Object'
            ),
            output(proc)
          )
          ok(!proc.stdout.includes('LOGS BUSY FINISHED'), output(proc))
          // What it sent before the browser closed got here by now
          await new Promise((resolve) => setTimeout(resolve, 500))
          is(calls, 0, output(proc))
        } finally {
          server.close()
        }
      })
    }

    it('a run timeout ends every file, and prints what they held back', async () => {
      // The first file never ends, the second one waits for it to print
      const proc = await runIn(
        mode,
        'mocha',
        ['mocha-hangs', 'page-order-2'],
        ['--test-concurrency', '2', '--run-timeout', '5000']
      )

      is(proc.exitCode, 1, output(proc))
      ok(proc.stderr.includes('Run timed out'), output(proc))
      ok(proc.stdout.includes('PAGE ORDER 2 written'), output(proc))
      ok(!proc.stdout.includes('ℹ files'), output(proc))
    })
  })
}
