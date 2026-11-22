import { strictEqual as is, ok } from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import fs from 'fs'
import { execa, runCli, TEST_CONCURRENCY } from './helpers.js'

describe('node:test runner', () => {
  const modes = ['node', 'main', 'worker']
  const fixture = (/** @type {string} */ name) =>
    `mocks/node-test-runner/${name}.test.js`

  /**
   * @param {string} name
   * @param {string} mode
   * @param {string[]} [args]
   */
  const run = (name, mode, args = ['--runner', 'node-test']) =>
    runCli([fixture(name), '--mode', mode, ...args], {
      reject: false,
    })

  /**
   * @param {import('execa').Result} proc
   */
  const output = (proc) => `${proc.stdout}\n${proc.stderr}`

  for (const mode of modes) {
    describe(`--mode ${mode}`, { concurrency: TEST_CONCURRENCY }, () => {
      it('runs node:test files', async () => {
        const proc = await run('pass', mode)

        is(proc.exitCode, 0, output(proc))
        for (const name of [
          'passes in a suite',
          'passes at the top',
          'passes in a subtest',
        ]) {
          ok(proc.stdout.includes(name), output(proc))
        }
      })

      it('is autodetected', async () => {
        const proc = await run('pass', mode, [])

        is(proc.exitCode, 0, output(proc))
        ok(
          proc.stderr.includes('Autodetected "node:test" as the runner'),
          proc.stderr
        )
        ok(proc.stdout.includes('passes in a suite'), output(proc))
      })

      it('fails when a test fails, also autodetected', async () => {
        const procs = await Promise.all(
          [['--runner', 'node-test'], []].map((args) => run('fail', mode, args))
        )
        for (const proc of procs) {
          is(proc.exitCode, 1, output(proc))
          ok(proc.stdout.includes('must fail'), output(proc))
        }
      })

      it('playwright-test/node-util is node:util', async () => {
        const proc = await run('util-entrypoint', mode)

        is(proc.exitCode, 0, output(proc))
        ok(proc.stdout.includes('same module'), output(proc))
      })

      it('fails when a test on the entrypoint fails', async () => {
        const proc = await run('entrypoint-fail', mode, [])

        is(proc.exitCode, 1, output(proc))
        ok(
          proc.stderr.includes('Autodetected "node:test" as the runner'),
          proc.stderr
        )
        ok(proc.stdout.includes('must fail on the entrypoint'), output(proc))
      })

      it('--test-timeout applies to tests in a suite, 0 is no timeout', async () => {
        const args = ['--runner', 'node-test', '--test-timeout']
        const [failed, passed] = await Promise.all([
          run('timeout', mode, [...args, '50']),
          run('timeout', mode, [...args, '0']),
        ])

        is(failed.exitCode, 1, output(failed))
        ok(failed.stdout.includes('is too slow'), output(failed))
        is(passed.exitCode, 0, output(passed))
      })
    })
  }

  // In node mode the shim gets the options from PW_OPTIONS, not from node flags
  it('--test-name-pattern and --test-timeout reach the shim in node mode', async () => {
    const args = ['--runner', 'node-test']
    const [filtered, timedOut] = await Promise.all([
      run('shim', 'node', [...args, '--test-name-pattern', 'alpha']),
      run('shim', 'node', [...args, '--test-timeout', '50']),
    ])

    is(filtered.exitCode, 0, output(filtered))
    ok(filtered.stdout.includes('ℹ pass 1'), output(filtered))
    ok(!filtered.stdout.includes('is too slow'), output(filtered))
    is(timedOut.exitCode, 1, output(timedOut))
    ok(timedOut.stdout.includes('ℹ cancelled 1'), output(timedOut))
    ok(timedOut.stdout.includes('ℹ pass 2'), output(timedOut))
  })

  // The real node:test in node mode, the shim in browsers, the same in main and worker
  for (const mode of ['node', 'main']) {
    describe(`--test-name-pattern with --mode ${mode}`, {
      concurrency: TEST_CONCURRENCY,
    }, () => {
      /** @type {Array<[string, string[]]>} */
      const patterns = [
        ['alpha', ['alpha one', 'alpha two', 'alpha top']],
        ['/ALPHA/i', ['alpha one', 'alpha two', 'alpha top']],
        // its own name, an ancestor and all the names joined
        ['^beta$', ['beta']],
        ['suite a', ['alpha one', 'beta']],
        ['^suite a beta$', ['beta']],
        // the full name of an ancestor, not only of the test
        ['^outer inner$', ['leaf']],
        ['does not match', []],
      ]
      const all = [
        'alpha one',
        'beta',
        'alpha two',
        'gamma',
        'leaf',
        'alpha top',
        'delta',
        'alpha nested',
        'other hook',
      ]

      for (const [pattern, expected] of patterns) {
        it(pattern, async () => {
          const proc = await run('grep', mode, [
            '--runner',
            'node-test',
            '--test-name-pattern',
            pattern,
          ])

          is(proc.exitCode, 0, output(proc))
          for (const name of all) {
            is(
              proc.stdout.includes(name),
              expected.includes(name),
              `${name} in:\n${proc.stdout}`
            )
          }
        })
      }
    })
  }

  describe('--test-timeout on hooks and subtests, the same on the real node:test', {
    concurrency: TEST_CONCURRENCY,
  }, () => {
    const slow = '() => new Promise((resolve) => setTimeout(resolve, 150))'
    const fast = '() => {}'
    const imports =
      "import { after, afterEach, before, beforeEach, describe, it, test } from 'node:test'"

    /** @type {Array<[string, string, number]>} */
    const cases = [
      ['root before', `before(${slow})\ntest('a', ${fast})`, 1],
      ['root beforeEach', `beforeEach(${slow})\ntest('a', ${fast})`, 1],
      ['root afterEach', `afterEach(${slow})\ntest('a', ${fast})`, 1],
      [
        'suite before',
        `describe('s', () => { before(${slow}); it('a', ${fast}) })`,
        1,
      ],
      [
        'suite after',
        `describe('s', () => { after(${slow}); it('a', ${fast}) })`,
        1,
      ],
      [
        'suite beforeEach',
        `describe('s', () => { beforeEach(${slow}); it('a', ${fast}) })`,
        1,
      ],
      [
        'suite afterEach',
        `describe('s', () => { afterEach(${slow}); it('a', ${fast}) })`,
        1,
      ],
      [
        'context before',
        `test('a', async (t) => { t.before(${slow}); await t.test('b', ${fast}) })`,
        1,
      ],
      [
        'context beforeEach',
        `test('a', async (t) => { t.beforeEach(${slow}); await t.test('b', ${fast}) })`,
        1,
      ],
      [
        'its own timeout',
        `describe('s', () => { before(${slow}, { timeout: 2000 }); it('a', ${fast}) })`,
        0,
      ],
      [
        'a test with its own timeout',
        `test('a', { timeout: 2000 }, ${slow})`,
        0,
      ],
      [
        'a fast hook',
        `describe('s', () => { before(${fast}); it('a', ${fast}) })`,
        0,
      ],
      [
        'a subtest of a test with a longer timeout',
        `test('a', { timeout: 2000 }, async (t) => { await t.test('b', ${slow}) })`,
        1,
      ],
      [
        'a subtest with an Infinity timeout of a test with a longer timeout',
        `test('a', { timeout: 2000 }, async (t) => { await t.test('b', { timeout: Infinity }, ${slow}) })`,
        0,
      ],
    ]

    /** @type {string} */
    let dir
    before(() => {
      dir = fs.mkdtempSync('mocks/tmp-hooks-')
    })
    after(() => {
      fs.rmSync(dir, { recursive: true })
    })

    let count = 0
    for (const mode of ['node', 'main']) {
      for (const [name, source, exitCode] of cases) {
        it(`${mode} ${name}`, async () => {
          const file = `${dir}/${count++}.test.js`
          fs.writeFileSync(file, `${imports}\n${source}\n`)
          const proc = await runCli(
            [
              file,
              '--runner',
              'node-test',
              '--mode',
              mode,
              '--test-timeout',
              '50',
            ],
            { reject: false }
          )

          is(proc.exitCode, exitCode, output(proc))
        })
      }
    }
  })

  it('a reporter from the config file is the real one in node mode', async () => {
    const proc = await run('pass', 'node', [
      '--runner',
      'node-test',
      '--config',
      'mocks/runner-options/reporter.config.js',
    ])

    is(proc.exitCode, 0, output(proc))
    ok(proc.stdout.includes('TAP version 13'), proc.stdout)
  })

  it('a reporter from the config file changes nothing in browsers', async () => {
    const proc = await run('pass', 'main', [
      '--runner',
      'node-test',
      '--config',
      'mocks/runner-options/reporter.config.js',
    ])

    is(proc.exitCode, 0, output(proc))
    ok(proc.stdout.includes('ℹ pass 3'), proc.stdout)
  })
})
