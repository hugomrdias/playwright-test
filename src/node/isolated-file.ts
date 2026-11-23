/**
 * Preloaded in each file of `--test-isolation process`, that `node --test`
 * runs in a process of its own.
 */
import { registerHooks } from 'node:module'

// Each file is a test of `node --test`, it reports them. The shim would report
// them again inside, and `node:test` is the same API.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier === 'playwright-test/node-test' ? 'node:test' : specifier,
      context
    )
  },
})

// A file that ignores SIGTERM can't outlive `node --test`, nothing would
// end it once the runner moved on. Its parent changes when that one is gone.
const parent = process.ppid
setInterval(() => {
  if (process.ppid !== parent) {
    process.kill(process.pid, 'SIGKILL')
  }
}, 100).unref()
