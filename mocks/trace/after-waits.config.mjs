/** biome-ignore-all lint/suspicious/noConsole: test */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The trace of the run, in its folder until the run decides to keep it
const written = () =>
  fs
    .readdirSync(os.tmpdir())
    .some((name) => fs.existsSync(path.join(os.tmpdir(), name, 'trace.zip')))

export default {
  // Written while this hook runs, and kept because it fails the run
  async afterTests() {
    const start = Date.now()
    while (!written() && Date.now() - start < 30_000) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    console.log(written() ? 'trace-written' : 'trace-missing')
    throw new Error('after-boom')
  },
}
