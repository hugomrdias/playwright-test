import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

/**
 * @param {string} file
 * @param {string[]} args
 */
function run(file, args) {
  return runCli([file, ...args], {
    // Fail here when nothing ends the run, instead of waiting for its timeout
    reject: false,
    timeout: 40_000,
  })
}

describe('errors while the tests load', () => {
  const throws = 'mocks/load-errors/throws.test.js'

  for (const runner of ['mocha', 'node-test', 'none']) {
    for (const mode of ['main', 'worker', 'node']) {
      it(`fails the run with --runner ${runner} --mode ${mode}`, async () => {
        const proc = await run(throws, ['--runner', runner, '--mode', mode])

        is(proc.timedOut, false, 'ended by itself')
        is(proc.exitCode, 1, 'exit code')
        ok(proc.stderr.includes('load-boom'), proc.stderr)
        ok(proc.stderr.includes('throws.test.js:1'), proc.stderr)
      })
    }
  }

  for (const browser of ['firefox', 'webkit']) {
    for (const mode of ['main', 'worker']) {
      it(`fails the run with --browser ${browser} --mode ${mode}`, async () => {
        const proc = await run(throws, [
          '--runner',
          'none',
          '--browser',
          browser,
          '--mode',
          mode,
        ])

        is(proc.timedOut, false, 'ended by itself')
        is(proc.exitCode, 1, 'exit code')
        ok(proc.stderr.includes('load-boom'), proc.stderr)
      })
    }
  }

  it('shows errors without a stack', async () => {
    const proc = await run('mocks/commonjs/top-level-await.test.js', [
      '--runner',
      'none',
    ])

    is(proc.timedOut, false, 'ended by itself')
    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('SyntaxError'), proc.stderr)
  })

  for (const mode of ['main', 'worker']) {
    it(`leaves uncaught errors after loading to the tests with --mode ${mode}`, async () => {
      const proc = await run('mocks/load-errors/after-load.test.js', [
        '--runner',
        'none',
        '--mode',
        mode,
      ])

      is(proc.exitCode, 0, proc.stderr)
      ok(proc.stderr.includes('after-load-boom'), proc.stderr)
    })
  }
})

describe('projects with type commonjs', () => {
  for (const mode of ['main', 'worker']) {
    it(`runs node-test with --mode ${mode}`, async () => {
      const proc = await run('mocks/commonjs/node-test.test.js', [
        '--runner',
        'node-test',
        '--mode',
        mode,
      ])

      is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
      ok(proc.stdout.includes('commonjs node-test'), proc.stdout)
    })
  }
})
