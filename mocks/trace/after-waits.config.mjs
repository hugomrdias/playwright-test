/** biome-ignore-all lint/suspicious/noConsole: test */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The folder of the run with its trace, there until the run decides to keep it
const folder = () =>
  fs
    .readdirSync(os.tmpdir())
    .map((name) => path.join(os.tmpdir(), name))
    .find((dir) => fs.existsSync(path.join(dir, 'trace.zip')))

export default {
  // Written while this hook runs, and kept because it fails the run
  async afterTests() {
    const start = Date.now()
    while (!folder() && Date.now() - start < 30_000) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const dir = folder()
    console.log(dir ? 'trace-written' : 'trace-missing')
    if (dir) {
      // Only for the user, other users can't read the trace
      console.log(`mode-${(fs.statSync(dir).mode & 0o777).toString(8)}`)
    }
    throw new Error('after-boom')
  },
}
