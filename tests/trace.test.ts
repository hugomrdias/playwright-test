import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { runCli } from './helpers.ts'

// Its own cwd, the trace of other runs can't end up there
const cwd = 'mocks/trace'
const trace = path.join(cwd, 'playwright-test-trace-chromium.zip')

function run(args: string[], env: Record<string, string> = {}) {
  return runCli(['--cwd', cwd, '--runner', 'mocha', ...args], {
    reject: false,
    timeout: 60_000,
    env,
  })
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
  // Copied next to it, then renamed
  equal(
    readdirSync(cwd).filter((name) => name.endsWith('.tmp')),
    [],
    'no copy left'
  )
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

  it('saves the trace when only the afterTests hook fails', async () => {
    const proc = await run([
      'pass.mocha.js',
      '--trace',
      '--config',
      'mocks/flow/after-throws.config.mjs',
    ])

    is(proc.exitCode, 1, proc.stderr)
    assertTrace()
  })

  it('writes the trace before the afterTests hook runs', async () => {
    // Its own, the hook looks for the trace of the run in it
    const temp = mkdtempSync(
      path.join(process.env.PW_TEST_CHILD_TEMP || tmpdir(), 'pw-trace-')
    )
    try {
      const proc = await run(
        [
          'pass.mocha.js',
          '--trace',
          '--config',
          `${cwd}/after-waits.config.mjs`,
        ],
        // Which one os.tmpdir() reads depends on the platform
        { TMPDIR: temp, TMP: temp, TEMP: temp }
      )

      is(proc.exitCode, 1, proc.stderr)
      ok(proc.stdout.includes('trace-written'), proc.stdout)
      // Windows has no modes, its temp folder is the user's
      if (process.platform !== 'win32') {
        ok(proc.stdout.includes('mode-700'), proc.stdout)
      }
      assertTrace()
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  it('keeps the trace of a passing run with on', async () => {
    const proc = await run(['pass.mocha.js', '--trace', 'on'])

    is(proc.exitCode, 0, proc.stderr)
    assertTrace()
  })

  it('keeps the trace in web-worker mode', async () => {
    const proc = await run([
      'fails.mocha.js',
      '--trace',
      '--mode',
      'web-worker',
    ])

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
})
