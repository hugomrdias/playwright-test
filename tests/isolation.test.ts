import { strictEqual as is, ok } from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import type { Result } from 'execa'
import { runCli, TEST_CONCURRENCY } from './helpers.ts'

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
  args: string[] = []
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
    { reject: false }
  )

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

    it('a run timeout ends every file', async () => {
      const proc = await runIn(
        mode,
        'mocha',
        ['mocha-a', 'mocha-slow'],
        ['--test-concurrency', '2', '--run-timeout', '1000']
      )

      is(proc.exitCode, 1, output(proc))
      ok(proc.stderr.includes('Run timed out'), output(proc))
      ok(proc.stdout.includes('has globals of its own'), output(proc))
      ok(!proc.stdout.includes('SLOW FINISHED'), output(proc))
    })
  })
}
