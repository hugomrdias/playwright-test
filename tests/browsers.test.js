import { describe, it } from 'node:test'
import { is } from 'uvu/assert'
import { execa } from './helpers.js'

// The other files run in chromium, this checks the main paths in the other browsers.
for (const browser of ['firefox', 'webkit']) {
  describe(browser, () => {
    const flags = ['--browser', browser]
    const runs = {
      mocha: ['./cli.js', 'mocks/test.mocha.js', ...flags],
      'taps node:test api': [
        './cli.js',
        'mocks/node-test/context.test.js',
        '--runner',
        './mocks/node-test/runner.js',
        ...flags,
      ],
      'node-test runner': [
        './cli.js',
        'mocks/node-test-runner/pass.test.js',
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
