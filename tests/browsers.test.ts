import { strictEqual as is } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execa, TEST_CONCURRENCY } from './helpers.ts'

// The other files run in chromium, this checks the main paths in the other browsers.
for (const browser of ['firefox', 'webkit']) {
  describe(browser, { concurrency: TEST_CONCURRENCY }, () => {
    const flags = ['--browser', browser]
    const runs = {
      mocha: ['./src/bin.ts', 'mocks/test.mocha.js', ...flags],
      'playwright-test/node-test': [
        './src/bin.ts',
        'mocks/node-test/context.test.js',
        '--runner',
        'node-test',
        ...flags,
      ],
      'node-test runner': [
        './src/bin.ts',
        'mocks/node-test-runner/pass.test.js',
        '--runner',
        'node-test',
        ...flags,
      ],
      'client context in a worker': [
        './src/bin.ts',
        'mocks/client/context.test.js',
        '--runner',
        'node-test',
        '--mode',
        'web-worker',
        ...flags,
      ],
      'client page input': [
        './src/bin.ts',
        'mocks/client/page.test.js',
        '--runner',
        'node-test',
        ...flags,
      ],
      'same node:assert results as the real one': [
        process.execPath,
        'mocks/node-test/assert-compare.js',
        ...flags,
      ],
    }

    for (const [name, [file, ...args]] of Object.entries(runs)) {
      it(name, { timeout: 120_000 }, async () => {
        // The test timeout fails the test but leaves a stuck child running
        const proc = await execa(file, args, { timeout: 100_000 })

        is(proc.exitCode, 0, 'exit code')
      })
    }
  })
}
