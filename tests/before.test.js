import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

describe('--before', () => {
  /**
   * @param {string} before
   * @param {string[]} [args]
   */
  function run(before, args = []) {
    return runCli(
      [
        'mocks/none/stdout.test.js',
        '--runner',
        'none',
        '--before',
        before,
        ...args,
      ],
      {
        // Fail here when the run doesn't stop, instead of hanging
        reject: false,
        timeout: 30_000,
      }
    )
  }

  for (const mode of ['main', 'worker']) {
    it(`runs in its own tab and then the tests with mode:${mode}`, async () => {
      const proc = await run('mocks/before/ends.js', ['--mode', mode])

      is(proc.exitCode, 0, proc.stderr)

      const done = proc.stdout.indexOf('before done')
      ok(
        proc.stdout.includes('before running in /before.html'),
        'ran in the before page'
      )
      ok(done !== -1, proc.stdout)
      ok(done < proc.stdout.indexOf('hello world!'), proc.stdout)
    })

    it(`runs the example in the docs with mode:${mode}`, async () => {
      const proc = await runCli(
        [
          'mocks/test.mocha.js',
          '--runner',
          'mocha',
          '--before',
          'mocks/before.js',
          '--mode',
          mode,
        ],
        { reject: false, timeout: 30_000 }
      )

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stdout.includes('Run before stuff'), proc.stdout)
      ok(proc.stdout.includes('passing'), proc.stdout)
    })
  }

  const failures = {
    'throws while loading': ['throws.js', 'before script threw'],
    'throws after loading': ['throws-later.js', 'before script threw later'],
    'has an unhandled rejection': ['rejects.js', 'before script rejected'],
    'rejects a top level await': [
      'top-level-await-rejects.js',
      'before script await rejected',
    ],
  }

  for (const [name, [file, message]] of Object.entries(failures)) {
    it(`fails the run right away when the script ${name}`, async () => {
      const proc = await run(`mocks/before/${file}`)

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes(message), proc.stderr)
      ok(proc.stderr.includes(`mocks/before/${file}`), proc.stderr)
      ok(!proc.stdout.includes('hello world!'), 'the tests did not run')
    })
  }

  it('only logs an error from after the script called beforeEnd', async () => {
    const proc = await run('mocks/before/ends-then-throws.js')

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stderr.includes('before script threw after ending'), proc.stderr)
    ok(proc.stdout.includes('hello world!'), 'the tests ran')
  })

  it('prints the output from before a script threw', async () => {
    const proc = await run('mocks/before/throws.js')

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stdout.includes('before started'), proc.stdout)
  })

  it('fails with only the error of the script with --watch', async () => {
    const proc = await run('mocks/before/throws.js', ['--watch'])

    is(proc.timedOut, false, 'ended by itself')
    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('before script threw'), proc.stderr)
    ok(!proc.stderr.includes('has been closed'), proc.stderr)
  })

  it('fails with the run timeout when the script never ends', async () => {
    const proc = await run('mocks/before/never-ends.js', [
      '--run-timeout',
      '1000',
    ])

    is(proc.timedOut, false, 'ended by itself')
    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Run timed out after 1000ms'), proc.stderr)
    ok(!proc.stdout.includes('hello world!'), 'the tests did not run')
  })

  it('fails when the script can not be found', async () => {
    const proc = await run('mocks/before/missing.js')

    is(proc.timedOut, false, 'ended by itself')
    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('mocks/before/missing.js'), proc.stderr)
  })
})
