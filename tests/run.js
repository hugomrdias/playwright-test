import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { run } from 'node:test'
import { spec } from 'node:test/reporters'
import { TEST_CONCURRENCY } from './helpers.js'

// Run the heaviest suites first so no slow file creates an idle tail at the end.
const HEAVY_FIRST = [
  'node-test.test.js',
  'runner-flow.test.js',
  'node-test-runner.test.js',
  'source-maps.test.js',
  'browsers.test.js',
  'runner-options.test.js',
  'output.test.js',
  'load-errors.test.js',
  'mocha.test.js',
  'before.test.js',
  'browser-ends.test.js',
  'workerd-mode.test.js',
  'trace.test.js',
]

const rank = (/** @type {string} */ name) => {
  const index = HEAVY_FIRST.indexOf(name)
  return index === -1 ? HEAVY_FIRST.length : index
}

// Paired with TEST_CONCURRENCY in tests/helpers.js:
// - CI (4 vCPUs): 2x2=4 on Windows, 3x2=6 on Linux/macOS
// - Local: scales with available cores (e.g. 3x3=9 on 10 cores)
const fileConcurrency = process.env.CI
  ? process.platform === 'win32'
    ? 2
    : 3
  : Math.min(
      4,
      Math.max(2, Math.floor(os.availableParallelism() / TEST_CONCURRENCY))
    )

const extraArgs = process.argv.slice(2)
if (extraArgs.length > 0) {
  // Forward custom flags / file filters directly to `node --test`.
  const hasExplicitFiles = extraArgs.some((arg) => !arg.startsWith('-'))
  const files = hasExplicitFiles ? [] : ['tests/*.test.js']
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-force-exit',
      '--test-timeout=50000',
      `--test-concurrency=${fileConcurrency}`,
      ...extraArgs,
      ...files,
    ],
    { stdio: 'inherit' }
  )
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
}

const files = fs
  .readdirSync('tests')
  .filter((name) => name.endsWith('.test.js'))
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  .map((name) => path.resolve('tests', name))

const stream = run({
  concurrency: fileConcurrency,
  files,
  forceExit: true,
  timeout: 50_000,
})
stream.on('test:fail', () => {
  process.exitCode = 1
})
stream.compose(spec).pipe(process.stdout)
