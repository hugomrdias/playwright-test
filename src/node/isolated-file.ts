/**
 * Preloaded in each file of `--test-isolation process`, that runs in a process
 * of its own.
 */
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'

// Each file is a test of `run()`, it reports them. The shim would report them
// again inside, and `node:test` is the same API.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier === 'playwright-test/node-test' ? 'node:test' : specifier,
      context
    )
  },
})

// The runner ends what's in there when it stops the run, also a file that
// ignores SIGTERM
const dir = process.env.PW_WORKER_PIDS
delete process.env.PW_WORKER_PIDS
if (dir) {
  const file = path.join(dir, String(process.pid))
  fs.writeFileSync(file, '')
  process.on('exit', () => {
    fs.rmSync(file, { force: true })
  })
}

// And if the runner is gone before it could, its parent changes
const parent = process.ppid
setInterval(() => {
  if (process.ppid !== parent) {
    process.kill(process.pid, 'SIGKILL')
  }
}, 100).unref()
