import { strictEqual as is, ok } from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import type { Result } from 'execa'
import { runCli, TEST_CONCURRENCY } from './helpers.ts'

// --test-isolation process in node mode for the runners that don't have it,
// node-test is in node-test-runner.test.ts
const dir = 'mocks/isolation'
const output = (proc: Result) => `${proc.stdout}\n${proc.stderr}`

function run(runner: string, files: string[], args: string[] = []) {
  return runCli(
    [
      ...files.map((file) => `${dir}/${file}.test.js`),
      '--runner',
      runner,
      '--mode',
      'node',
      ...args,
    ],
    { reject: false }
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

  it('a file ended by bail is cancelled, even if it exits with 0', async () => {
    const proc = await run(
      'mocha',
      ['mocha-fails', 'mocha-sigterm'],
      ['--test-concurrency', '2']
    )

    is(proc.exitCode, 1, output(proc))
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
