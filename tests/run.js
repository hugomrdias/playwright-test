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

// Node CLI flags that consume the following argument when not using `--flag=value`.
const VALUE_OPTIONS = new Set([
  '-C',
  '--conditions',
  '-r',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader',
  '--env-file',
  '--env-file-if-exists',
  '--disable-warning',
  '--localstorage-file',
  '--redirect-warnings',
  '--report-dir',
  '--report-directory',
  '--report-filename',
  '--report-signal',
  '--diagnostic-dir',
  '--cpu-prof-dir',
  '--cpu-prof-interval',
  '--cpu-prof-name',
  '--heap-prof-dir',
  '--heap-prof-interval',
  '--heap-prof-name',
  '--inspect-port',
  '--debug-port',
  '--inspect-publish-uid',
  '--max-http-header-size',
  '--max-old-space-size-percentage',
  '--unhandled-rejections',
  '--v8-pool-size',
  '--watch-path',
  '--watch-kill-signal',
  '--experimental-test-isolation',
  '--experimental-test-tag-filter',
  '--test-concurrency',
  '--test-coverage-branches',
  '--test-coverage-exclude',
  '--test-coverage-functions',
  '--test-coverage-include',
  '--test-coverage-lines',
  '--test-global-setup',
  '--test-isolation',
  '--test-name-pattern',
  '--test-random-seed',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-rerun-failures',
  '--test-shard',
  '--test-skip-pattern',
  '--test-timeout',
])

/**
 * Whether `args` includes at least one positional test file or glob rather than
 * only Node CLI flags and their values.
 *
 * @param {string[]} args
 */
function hasExplicitFiles(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--') {
      return i + 1 < args.length
    }
    if (!arg.startsWith('-') || arg === '-') {
      return true
    }
    if (arg.includes('=')) {
      continue
    }
    const normalized = arg.startsWith('--') ? arg.replaceAll('_', '-') : arg
    if (VALUE_OPTIONS.has(normalized)) {
      i++
    }
  }
  return false
}

const extraArgs = process.argv.slice(2)
if (extraArgs.length > 0) {
  // Forward custom flags / file filters directly to `node --test`.
  const files = hasExplicitFiles(extraArgs) ? [] : ['tests/*.test.js']
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
