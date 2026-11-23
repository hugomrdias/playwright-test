import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
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

/** If it never started or is already gone */
function ended(child: ChildProcess) {
  return (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  )
}

/**
 * End a subprocess that won't end by itself. On Windows killing it doesn't reach
 * its children.
 */
export function killTree(child: ChildProcess) {
  if (ended(child)) {
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

/**
 * End a subprocess now, without giving it the chance to end by itself. For
 * when this process is about to exit and can't wait for it.
 */
export function forceKill(child: ChildProcess) {
  if (ended(child)) {
    return
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    })
    return
  }
  child.kill('SIGKILL')
}

/**
 * Whether a process is still there, and not only waiting for its parent to
 * read its exit code. Without a parent that does, it stays a zombie.
 */
export function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  if (process.platform !== 'linux') {
    return true
  }
  try {
    // `pid (name) state ...`, the name can have spaces and parentheses
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return (
      stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z'
    )
  } catch {
    return false
  }
}
