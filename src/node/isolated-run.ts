/**
 * The process that runs {@link runIsolated} in the env of the tests, when the
 * CLI can't run it itself. It reads its options as JSON on stdin.
 */
import { type IsolatedRunOptions, runIsolated } from './node-test-run.ts'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString()) as Omit<
    IsolatedRunOptions,
    'cwd' | 'env' | 'signal'
  >
}

const options = await readStdin()
const controller = new AbortController()
// Stopping the run ends the files and still reports what ran
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort())
}

const passed = await runIsolated({
  ...options,
  cwd: process.cwd(),
  signal: controller.signal,
})
if (!passed) {
  process.exitCode = 1
}
