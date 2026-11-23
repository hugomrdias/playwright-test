import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import path from 'node:path'

/** How long a subprocess has to end after being asked to. */
export const FORCE_KILL_DELAY = 5000

/**
 * Add `node_modules/.bin` of `cwd` and its parents to `PATH`, tests can start
 * the binaries of the project by name.
 */
export function withLocalBins(
  env: Record<string, string | undefined>,
  cwd: string
) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  const dirs = []
  let dir = path.resolve(cwd)
  while (true) {
    dirs.push(path.join(dir, 'node_modules', '.bin'))
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  dirs.push(path.dirname(process.execPath))
  if (env[key]) {
    dirs.push(env[key])
  }
  return { ...env, [key]: dirs.join(path.delimiter) }
}

/**
 * End a subprocess that won't end by itself. On Windows killing it doesn't reach
 * its children.
 */
export function killTree(child: ChildProcess) {
  // Never started or already gone
  if (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  ) {
    return
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    }).once('error', () => child.kill())
    return
  }
  child.kill()
  const force = setTimeout(() => child.kill('SIGKILL'), FORCE_KILL_DELAY)
  force.unref()
  child.once('close', () => clearTimeout(force))
}
