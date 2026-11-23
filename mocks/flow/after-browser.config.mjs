/** biome-ignore-all lint/suspicious/noConsole: test */
import { execFileSync } from 'node:child_process'

/** If a browser this process started is still there */
function browserRunning() {
  try {
    execFileSync('pgrep', ['-P', String(process.pid), '-f', '-i', 'chrom'])
    return true
  } catch {
    return false
  }
}

export default {
  afterTests: () => {
    console.log(browserRunning() ? 'browser-running' : 'browser-closed')
    return Promise.resolve()
  },
}
