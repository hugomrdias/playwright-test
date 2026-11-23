import { deepStrictEqual, strictEqual as is, ok } from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { execa, runCli, TEST_CONCURRENCY } from './helpers.ts'

/**
 * The processes started by this one, all the way down.
 */
function descendants(pid: number): Array<{ pid: number; command: string }> {
  let children = []
  try {
    children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map(Number)
  } catch {
    // pgrep fails when there are none
    return []
  }
  return children.flatMap((child) => {
    let command = ''
    try {
      command = execFileSync('ps', ['-o', 'command=', '-p', String(child)], {
        encoding: 'utf8',
      })
    } catch {
      // it ended
    }
    return [{ pid: child, command }, ...descendants(child)]
  })
}

/**
 * Run tests that never end, kill browser processes once they run.
 *
 * @param which - the processes to kill
 */
async function killDuringRun(
  which: (command: string) => boolean,
  args: string[] = [],
  file: string = 'mocks/flow/never-ends.js',
  env: Record<string, string> = {}
) {
  const proc = runCli([file, '--runner', 'none', ...args], {
    reject: false,
    timeout: 30_000,
    env,
  })
  proc.stdout?.on('data', (data: Buffer) => {
    if (!data.toString().includes('flow-running')) {
      return
    }
    const targets = descendants(proc.pid as number).filter(
      ({ command }) => command.includes('chrom') && which(command)
    )
    ok(targets.length > 0, 'found the processes to kill')
    for (const { pid } of targets) {
      process.kill(pid, 'SIGKILL')
    }
  })
  return await proc
}

// Killing the processes stands for a crash and for --debug users closing the
// browser, which can't be tested without a display
describe('the browser ending the run', {
  concurrency: TEST_CONCURRENCY,
  skip: process.platform === 'win32' && 'needs pgrep',
}, () => {
  for (const args of [[], ['--mode', 'web-worker']]) {
    const flags = args.join(' ') || 'default options'

    it(`fails with why when the page crashes with ${flags}`, async () => {
      const proc = await killDuringRun(
        (command) => command.includes('--type=renderer'),
        args
      )

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(
        proc.stderr.includes(
          'The test page crashed, it may have run out of memory.'
        ),
        proc.stderr
      )
      ok(!proc.stderr.includes('Target crashed'), proc.stderr)
    })

    it(`fails with why when the browser closes with ${flags}`, async () => {
      const proc = await killDuringRun(
        (command) => !command.includes('--type='),
        args
      )

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(
        proc.stderr.includes('The browser closed before the tests ended.'),
        proc.stderr
      )
      ok(!proc.stderr.includes('Browser logs'), proc.stderr)
      ok(!proc.stderr.includes('Could not close the browser'), proc.stderr)
    })
  }
})

it('the browser closing leaves no files of the run', {
  skip: process.platform === 'win32' && 'needs pgrep',
}, async () => {
  const temp = mkdtempSync(
    path.join(process.env.PW_TEST_CHILD_TEMP || os.tmpdir(), 'pw-ends-')
  )
  try {
    const proc = await killDuringRun(
      (command) => !command.includes('--type='),
      [],
      undefined,
      // Which one os.tmpdir() reads depends on the platform
      { TMPDIR: temp, TMP: temp, TEMP: temp }
    )

    is(proc.exitCode, 1, 'exit code')
    // Playwright's own, for downloads, it deletes it in the background once
    // the browser is gone, this process can exit first
    deepStrictEqual(
      readdirSync(temp).filter(
        (name) =>
          name !== 'node-compile-cache' &&
          !name.startsWith('playwright-artifacts-')
      ),
      []
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

describe('the browser ending a traced run', {
  skip: process.platform === 'win32' && 'needs pgrep',
}, () => {
  const trace = 'mocks/flow/playwright-test-trace-chromium.zip'
  const args = ['--cwd', 'mocks/flow', '--trace']

  it('still saves the trace when the page crashes', async () => {
    rmSync(trace, { force: true })
    try {
      const proc = await killDuringRun(
        (command) => command.includes('--type=renderer'),
        args,
        'never-ends.js'
      )

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes('Saved the trace'), proc.stderr)
      ok(statSync(trace).size > 0, 'trace is not empty')
    } finally {
      rmSync(trace, { force: true })
    }
  })

  it('says it could not save the trace when the browser closes', async () => {
    rmSync(trace, { force: true })
    try {
      const proc = await killDuringRun(
        (command) => !command.includes('--type='),
        args,
        'never-ends.js'
      )

      is(proc.timedOut, false, 'ended by itself')
      is(proc.exitCode, 1, 'exit code')
      ok(
        proc.stderr.includes(
          'Could not save the trace, the browser closed before the run ended.'
        ),
        proc.stderr
      )
      ok(!existsSync(trace), 'no trace')
    } finally {
      rmSync(trace, { force: true })
    }
  })
})

describe('the test page closing', () => {
  it('fails the run with why', async () => {
    const proc = await execa(process.execPath, ['mocks/flow/closes-page.mjs'], {
      reject: false,
      timeout: 30_000,
    })

    is(proc.timedOut, false, 'ended by itself')
    is(proc.exitCode, 1, 'exit code')
    ok(
      proc.stderr.includes('The test page closed before the tests ended.'),
      proc.stderr
    )
    ok(!proc.stderr.includes('Target page'), proc.stderr)
  })
})
