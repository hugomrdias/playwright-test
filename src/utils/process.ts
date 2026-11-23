import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
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

/** Subprocesses spawned with `detached: true`, they lead their own process group. */
const groups = new WeakSet<ChildProcess>()

/**
 * Options to spawn a subprocess in its own process group, so that killing it
 * also kills what it started, like the workers of `node --test`. Not on
 * Windows, where `taskkill /T` already does that.
 */
export function groupOptions() {
  return { detached: process.platform !== 'win32' }
}

/**
 * Remember that a subprocess spawned with {@link groupOptions} leads a group.
 */
export function trackGroup(child: ChildProcess) {
  if (process.platform !== 'win32') {
    groups.add(child)
  }
  return child
}

/** Signal the subprocess, or its whole group. It's fine if it's gone. */
function signal(child: ChildProcess, name: NodeJS.Signals) {
  if (!groups.has(child) || child.pid === undefined) {
    child.kill(name)
    return
  }
  try {
    process.kill(-child.pid, name)
  } catch {
    // The group is gone
  }
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
  signal(child, 'SIGTERM')
  const force = setTimeout(() => signal(child, 'SIGKILL'), FORCE_KILL_DELAY)
  force.unref()
  child.once('close', () => {
    clearTimeout(force)
    // What it started and didn't end with it, nothing will wait for it
    if (groups.has(child)) {
      signal(child, 'SIGKILL')
    }
  })
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
  signal(child, 'SIGKILL')
}
