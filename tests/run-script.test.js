import { strictEqual as is, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execa, TEST_CONCURRENCY } from './helpers.js'
import { hasExplicitFiles } from './run.js'

describe('tests/run.js argument handling', {
  concurrency: TEST_CONCURRENCY,
}, () => {
  it('distinguishes flag values from positional file arguments', () => {
    is(hasExplicitFiles(['--test-reporter', 'tap']), false)
    is(hasExplicitFiles(['--test-name-pattern', 'runner flow']), false)
    is(hasExplicitFiles(['--test_name_pattern', 'runner flow']), false)
    is(hasExplicitFiles(['--dns-result-order', 'ipv4first']), false)
    is(hasExplicitFiles(['--icu-data-dir', '/tmp/icu']), false)
    is(hasExplicitFiles(['-C', 'development']), false)
    is(hasExplicitFiles(['--test-only']), false)
    is(hasExplicitFiles(['--test-name-pattern=foo']), false)

    is(hasExplicitFiles(['tests/colors.test.js']), true)
    is(
      hasExplicitFiles([
        '--dns-result-order',
        'ipv4first',
        'tests/colors.test.js',
      ]),
      true
    )
    is(hasExplicitFiles(['--test-only', 'tests/colors.test.js']), true)
    is(hasExplicitFiles(['--inspect', 'tests/colors.test.js']), true)
    is(hasExplicitFiles(['--', 'tests/colors.test.js']), true)
    is(hasExplicitFiles(['--']), false)
  })

  it('keeps tests/*.test.js scope for split and equals forms of value flags', async () => {
    const base = [
      '--test-name-pattern=ReviewNoTestsMatchXYZ',
      '--test-shard=1/1000',
      '--test-reporter=spec',
    ]
    const [splitDns, equalsDns, splitPattern] = await Promise.all([
      execa(
        process.execPath,
        ['tests/run.js', '--dns-result-order', 'ipv4first', ...base],
        { reject: false }
      ),
      execa(
        process.execPath,
        ['tests/run.js', '--dns-result-order=ipv4first', ...base],
        { reject: false }
      ),
      execa(
        process.execPath,
        [
          'tests/run.js',
          '--test-name-pattern',
          'ReviewNoTestsMatchXYZ',
          '--test-shard=1/1000',
          '--test-reporter=spec',
        ],
        { reject: false }
      ),
    ])

    for (const proc of [splitDns, equalsDns, splitPattern]) {
      is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
      ok(/tests[/\\]auto-detect\.test\.js/.test(proc.stdout), proc.stdout)
      ok(!/mocks[/\\]/.test(proc.stdout), proc.stdout)
    }
  })

  it('runs only explicit test files when provided alongside flags', async () => {
    const proc = await execa(
      process.execPath,
      [
        'tests/run.js',
        '--dns-result-order',
        'ipv4first',
        '--test-name-pattern',
        'isColorForced',
        'tests/colors.test.js',
      ],
      { reject: false }
    )

    is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    ok(proc.stdout.includes('isColorForced'), proc.stdout)
    ok(!/mocks[/\\]/.test(proc.stdout), proc.stdout)
  })
})
