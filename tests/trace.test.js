import { strictEqual as is, ok } from 'node:assert/strict'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { runCli } from './helpers.js'

// Its own cwd, the trace of other runs can't end up there
const cwd = 'mocks/trace'
const trace = path.join(cwd, 'playwright-test-trace-chromium.zip')

/**
 * @param {string[]} args
 */
function run(args) {
  return runCli(['--cwd', cwd, ...args], { reject: false, timeout: 60_000 })
}

/**
 * A zip with the actions of the run, Playwright names it `trace.trace`
 */
function assertTrace() {
  ok(existsSync(trace), 'saved the trace')
  const zip = readFileSync(trace)
  ok(zip.length > 0, 'not empty')
  is(zip.subarray(0, 4).toString('hex'), '504b0304', 'is a zip')
  ok(zip.includes('trace.trace'), 'has the trace')
}

describe('--trace', () => {
  beforeEach(() => rmSync(trace, { force: true }))
  afterEach(() => rmSync(trace, { force: true }))

  it('saves the trace of a failed run', async () => {
    const proc = await run(['fails.mocha.js', '--trace'])

    is(proc.exitCode, 1, proc.stderr)
    ok(
      proc.stderr.includes(
        `Saved the trace, open it with \`npx playwright show-trace ${trace}\`.`
      ),
      proc.stderr
    )
    assertTrace()
  })

  it('does not keep the trace of a passing run', async () => {
    const proc = await run(['pass.mocha.js', '--trace'])

    is(proc.exitCode, 0, proc.stderr)
    ok(!proc.stderr.includes('Saved the trace'), proc.stderr)
    ok(!existsSync(trace), 'no trace')
  })

  it('keeps the trace of a passing run with on', async () => {
    const proc = await run(['pass.mocha.js', '--trace', 'on'])

    is(proc.exitCode, 0, proc.stderr)
    assertTrace()
  })

  it('keeps the trace in worker mode', async () => {
    const proc = await run(['fails.mocha.js', '--trace', '--mode', 'worker'])

    is(proc.exitCode, 1, proc.stderr)
    assertTrace()
  })

  it('records nothing with off', async () => {
    const proc = await run(['fails.mocha.js', '--trace', 'off'])

    is(proc.exitCode, 1, proc.stderr)
    ok(!existsSync(trace), 'no trace')
  })

  it('takes it from the config file', async () => {
    const proc = await run([
      'pass.mocha.js',
      '--config',
      `${cwd}/trace-on.config.mjs`,
    ])

    is(proc.exitCode, 0, proc.stderr)
    assertTrace()
  })

  it('fails with node mode', async () => {
    const proc = await run(['pass.mocha.js', '--trace', '--mode', 'node'])

    is(proc.exitCode, 1)
    ok(
      proc.stderr.includes(
        '--trace records the browser, it does not work with --mode node.'
      ),
      proc.stderr
    )
    ok(!existsSync(trace), 'no trace')
  })

  it('fails with a value it does not know', async () => {
    const proc = await run(['--trace', 'pass.mocha.js'])

    is(proc.exitCode, 1)
    ok(
      proc.stderr.includes(
        'Invalid --trace "pass.mocha.js", expected "on", "off" or "retain-on-failure".'
      ),
      proc.stderr
    )
  })
})
