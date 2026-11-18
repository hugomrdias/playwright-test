import { strictEqual as is, ok } from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

/**
 * The processes started by this one, all the way down.
 *
 * @param {number} pid
 * @returns {Array<{ pid: number, command: string }>}
 */
function descendants(pid) {
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
 * @param {(command: string) => boolean} which - the processes to kill
 * @param {string[]} [args]
 */
async function killDuringRun(which, args = []) {
  const proc = runCli(
    ['mocks/flow/never-ends.js', '--runner', 'none', ...args],
    {
      reject: false,
      timeout: 30_000,
    }
  )
  proc.stdout?.on('data', (/** @type {Buffer} */ data) => {
    if (!data.toString().includes('flow-running')) {
      return
    }
    const targets = descendants(/** @type {number} */ (proc.pid)).filter(
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
  skip: process.platform === 'win32' && 'needs pgrep',
}, () => {
  for (const args of [[], ['--incognito'], ['--mode', 'worker']]) {
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
