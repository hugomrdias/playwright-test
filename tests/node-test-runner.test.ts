import { strictEqual as is, ok } from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { Result } from 'execa'
import fs from 'fs'
import { pathToFileURL } from 'url'
import { isRunning } from '../src/utils/process.ts'
import { runCli, TEST_CONCURRENCY } from './helpers.ts'

describe('node:test runner', () => {
  const modes = ['node', 'browser', 'web-worker']
  const fixture = (name: string) => `mocks/node-test-runner/${name}.test.js`

  const run = (
    name: string,
    mode: string,
    args: string[] = ['--runner', 'node-test']
  ) =>
    runCli([fixture(name), '--mode', mode, ...args], {
      reject: false,
    })

  const output = (proc: Result) => `${proc.stdout}\n${proc.stderr}`

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

      it('is the default runner', async () => {
        const proc = await run('pass', mode, [])

        is(proc.exitCode, 0, output(proc))
        ok(proc.stdout.includes('passes in a suite'), output(proc))
      })

      it('fails when a test fails, also by default', async () => {
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

  describe('--test-isolation in node mode', {
    concurrency: TEST_CONCURRENCY,
  }, () => {
    const files = [
      'mocks/node-test-runner/isolation/a.test.js',
      'mocks/node-test-runner/isolation/b.test.js',
    ]
    const isolation = (args: string[]) =>
      runCli([...files, '--runner', 'node-test', '--mode', 'node', ...args], {
        reject: false,
      })

    it('process, the default, runs each file on its own', async () => {
      const [byDefault, process1] = await Promise.all([
        isolation([]),
        isolation(['--test-isolation', 'process', '--test-concurrency', '1']),
      ])

      for (const proc of [byDefault, process1]) {
        is(proc.exitCode, 0, output(proc))
        ok(proc.stdout.includes('ℹ pass 2'), output(proc))
      }
    })

    it('none runs the files together, they share globals', async () => {
      const proc = await isolation(['--test-isolation', 'none'])

      is(proc.exitCode, 1, output(proc))
      ok(proc.stdout.includes('ℹ fail 1'), output(proc))
    })

    it('runs the files as they are, without glob patterns', async () => {
      // Biome wants kebab-case names in the repo, and Windows has no `*`
      const dir = fs.mkdtempSync('mocks/tmp-glob-')
      const write = (name: string, body: string) =>
        fs.writeFileSync(
          `${dir}/${name}`,
          `import { test } from 'node:test'\ntest('${name}', () => { ${body} })\n`
        )
      write('[case]{a,b}(c).test.js', "throw new Error('fails')")
      write('left{.test.js', '')
      // What a pattern for left{ could match too
      write('leftz.test.js', "throw new Error('not selected')")
      try {
        const [glob, sibling] = await Promise.all(
          ['[case]{a,b}(c).test.js', 'left{.test.js'].map((name) =>
            runCli(
              [`${dir}/${name}`, '--runner', 'node-test', '--mode', 'node'],
              {
                reject: false,
              }
            )
          )
        )

        is(glob.exitCode, 1, output(glob))
        ok(glob.stdout.includes('ℹ fail 1'), output(glob))
        is(sibling.exitCode, 0, output(sibling))
        ok(sibling.stdout.includes('ℹ tests 1'), output(sibling))
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    })

    it('runs from a test of node:test', async () => {
      const proc = await runCli(
        [fixture('fail'), '--runner', 'node-test', '--mode', 'node'],
        { reject: false, env: { NODE_TEST_CONTEXT: 'child-v8' } }
      )

      is(proc.exitCode, 1, output(proc))
      ok(proc.stdout.includes('ℹ fail 1'), output(proc))
    })

    it('playwright-test/node-test is the real node:test, tests can come after a top-level await', async () => {
      const proc = await runCli(
        [
          'mocks/node-test-runner/isolation-late/late.test.js',
          '--runner',
          'node-test',
          '--mode',
          'node',
        ],
        { reject: false }
      )

      is(proc.exitCode, 0, output(proc))
      ok(!output(proc).includes('created after'), output(proc))
    })

    it('a reporter comes from the project, with the conditions of import', async () => {
      const dir = fs.mkdtempSync('mocks/tmp-reporter-')
      const pkg = `${dir}/node_modules/only-import-reporter`
      fs.mkdirSync(pkg, { recursive: true })
      fs.writeFileSync(
        `${pkg}/package.json`,
        JSON.stringify({
          name: 'only-import-reporter',
          type: 'module',
          exports: { import: './index.js' },
        })
      )
      fs.writeFileSync(
        `${pkg}/index.js`,
        "export default async function* (source) { for await (const event of source) { if (event.type === 'test:pass') yield 'REPORTED ' + event.data.name + '\\n' } }\n"
      )
      fs.writeFileSync(
        `${dir}/broken-reporter.js`,
        "await new Promise((resolve) => setTimeout(resolve, 100))\nthrow new Error('reporter-boom')\n"
      )
      fs.writeFileSync(
        `${dir}/marker.test.js`,
        "import fs from 'node:fs'\nimport { test } from 'node:test'\ntest('writes', () => { fs.writeFileSync('marker.txt', '') })\n"
      )
      const config = (reporter: string) =>
        fs.writeFileSync(
          `${dir}/${reporter.replace(/\W/g, '')}.config.js`,
          `export default { testRunner: { options: { reporter: '${reporter}' } } }\n`
        )
      config('only-import-reporter')
      config('./broken-reporter.js')
      const cli = (reporter: string) =>
        runCli(
          [
            'marker.test.js',
            '--runner',
            'node-test',
            '--mode',
            'node',
            '--cwd',
            dir,
            '--config',
            `${dir}/${reporter.replace(/\W/g, '')}.config.js`,
          ],
          { reject: false }
        )
      try {
        const broken = await cli('./broken-reporter.js')
        is(broken.exitCode, 1, output(broken))
        ok(output(broken).includes('reporter-boom'), output(broken))
        is(fs.existsSync(`${dir}/marker.txt`), false, 'a file ran')

        const proc = await cli('only-import-reporter')
        is(proc.exitCode, 0, output(proc))
        ok(proc.stdout.includes('REPORTED writes'), output(proc))
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    })

    it('a reporter of the project runs in the project, with the env of the tests', async () => {
      const dir = fs.mkdtempSync('mocks/tmp-reporter-context-')
      fs.writeFileSync(
        `${dir}/context-reporter.js`,
        "import path from 'node:path'\nexport default async function* (source) { for await (const event of source) { if (event.type === 'test:pass') yield 'CONTEXT ' + path.basename(process.cwd()) + ' ' + process.env.FROM_BEFORE + '\\n' } }\n"
      )
      fs.writeFileSync(
        `${dir}/a.test.js`,
        "import { test } from 'node:test'\ntest('passes', () => {})\n"
      )
      fs.writeFileSync(
        `${dir}/reporter.config.js`,
        "export default { beforeTests: (env) => { env.FROM_BEFORE = 'set' }, testRunner: { options: { reporter: './context-reporter.js' } } }\n"
      )
      try {
        const proc = await runCli(
          [
            'a.test.js',
            '--mode',
            'node',
            '--cwd',
            dir,
            '--config',
            `${dir}/reporter.config.js`,
          ],
          { reject: false }
        )
        is(proc.exitCode, 0, output(proc))
        ok(
          proc.stdout.includes(`CONTEXT ${dir.split('/').pop()} set`),
          output(proc)
        )
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    })

    it('the files get the NODE_OPTIONS of the tests, also when beforeTests changes it', async () => {
      const dir = fs.mkdtempSync('mocks/tmp-node-options-')
      const preload = `${dir}/preload.js`
      fs.writeFileSync(
        preload,
        "if (process.argv[1]?.endsWith('a.test.js')) console.log('PRELOADED')\n"
      )
      fs.writeFileSync(
        `${dir}/a.test.js`,
        "import { test } from 'node:test'\ntest('passes', () => {})\n"
      )
      fs.writeFileSync(
        `${dir}/remove.config.js`,
        'export default { beforeTests: (env) => { delete env.NODE_OPTIONS } }\n'
      )
      const cli = (args: string[]) =>
        runCli(['a.test.js', '--mode', 'node', '--cwd', dir, ...args], {
          reject: false,
          // A URL, an absolute path of Windows isn't one
          env: { NODE_OPTIONS: `--import ${pathToFileURL(preload).href}` },
        })
      try {
        const kept = await cli([])
        is(kept.exitCode, 0, output(kept))
        ok(kept.stdout.includes('PRELOADED'), output(kept))

        const removed = await cli(['--config', `${dir}/remove.config.js`])
        is(removed.exitCode, 0, output(removed))
        ok(!removed.stdout.includes('PRELOADED'), output(removed))
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    })

    it('a run timeout also ends a file that blocks and ignores SIGTERM', async () => {
      const dir = fs.mkdtempSync('mocks/tmp-blocked-')
      const file = `${dir}/pid.txt`
      try {
        const proc = await runCli(
          [
            'mocks/node-test-runner/isolation-kill/blocked.test.js',
            '--runner',
            'node-test',
            '--mode',
            'node',
            '--run-timeout',
            '1000',
          ],
          { reject: false, env: { STUBBORN_FILE: file } }
        )
        is(proc.exitCode, 1, output(proc))
        const pid = Number(fs.readFileSync(file, 'utf8'))
        is(isRunning(pid), false, `${pid} is still running`)
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    })

    it('a run timeout also ends the files that ignore SIGTERM', async () => {
      const dir = fs.mkdtempSync('mocks/tmp-stubborn-')
      const file = `${dir}/out.txt`
      try {
        const proc = await runCli(
          [
            'mocks/node-test-runner/isolation-kill/stubborn.test.js',
            '--runner',
            'node-test',
            '--mode',
            'node',
            '--run-timeout',
            '1000',
          ],
          { reject: false, env: { STUBBORN_FILE: file } }
        )
        is(proc.exitCode, 1, output(proc))
        // A file notices within 100ms that node --test is gone, it can write
        // once more in that time
        const wait = () => new Promise((resolve) => setTimeout(resolve, 500))
        await wait()
        const lines = fs.readFileSync(file, 'utf8')
        await wait()
        is(fs.readFileSync(file, 'utf8'), lines, 'it kept running')
      } finally {
        fs.rmSync(dir, { recursive: true })
      }
    })
  })

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
  for (const mode of ['node', 'browser']) {
    describe(`--test-name-pattern with --mode ${mode}`, {
      concurrency: TEST_CONCURRENCY,
    }, () => {
      const patterns: [string, string[]][] = [
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

      it('more than one pattern runs what matches any', async () => {
        const proc = await run('grep', mode, [
          '--runner',
          'node-test',
          '--test-name-pattern',
          '^beta$',
          '--test-name-pattern',
          '/GAMMA/i',
        ])

        is(proc.exitCode, 0, output(proc))
        for (const name of all) {
          is(
            proc.stdout.includes(name),
            ['beta', 'gamma', 'other hook'].includes(name),
            `${name} in:\n${proc.stdout}`
          )
        }
      })

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

    const cases: [string, string, number][] = [
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

    let dir: string
    before(() => {
      dir = fs.mkdtempSync('mocks/tmp-hooks-')
    })
    after(() => {
      fs.rmSync(dir, { recursive: true })
    })

    let count = 0
    for (const mode of ['node', 'browser']) {
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
    const proc = await run('pass', 'browser', [
      '--runner',
      'node-test',
      '--config',
      'mocks/runner-options/reporter.config.js',
    ])

    is(proc.exitCode, 0, output(proc))
    ok(proc.stdout.includes('ℹ pass 3'), proc.stdout)
  })
})
