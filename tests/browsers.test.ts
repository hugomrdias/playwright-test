import { strictEqual as is } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execa, runTest, TEST_CONCURRENCY } from './helpers.ts'

// The other files run in chromium, this checks the main paths in the other browsers.
for (const browser of ['firefox', 'webkit']) {
  describe(browser, { concurrency: TEST_CONCURRENCY }, () => {
    const flags = ['--browser', browser]
    const runs = {
      mocha: ['mocks/test.mocha.js', '--runner', 'mocha', ...flags],
      'playwright-test/node-test': [
        'mocks/node-test/context.test.js',
        '--runner',
        'node-test',
        ...flags,
      ],
      'node-test runner': [
        'mocks/node-test-runner/pass.test.js',
        '--runner',
        'node-test',
        ...flags,
      ],
      'client context in a worker': [
        'mocks/client/context.test.js',
        '--runner',
        'node-test',
        '--mode',
        'web-worker',
        ...flags,
      ],
      'client page input': [
        'mocks/client/page.test.js',
        '--runner',
        'node-test',
        ...flags,
      ],
    }

    for (const [name, args] of Object.entries(runs)) {
      it(name, { timeout: 120_000 }, async () => {
        const proc = await runTest(args, { timeout: 100_000 })

        is(proc.exitCode, 0, 'exit code')
      })
    }

    it('same node:assert results as the real one', {
      timeout: 120_000,
    }, async () => {
      const proc = await execa(
        process.execPath,
        ['mocks/node-test/assert-compare.js', ...flags],
        { timeout: 100_000 }
      )

      is(proc.exitCode, 0, 'exit code')
    })
  })
}
