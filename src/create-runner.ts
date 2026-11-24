import { NodeRunner } from './node/runner.ts'
import type { Runner } from './runner.ts'
import type { Config, RunResult, WatchHandle } from './types.ts'
import { defaultOptions, UsageError } from './utils/index.ts'
import type { WorkerdRunner } from './workerd/runner.ts'

export type AnyRunner = Runner | NodeRunner | WorkerdRunner

/**
 * Create the runner for `options.mode` (`browser`, `web-worker`, `node`, or
 * `workerd`). Other modes' runners are imported lazily so node mode never
 * loads Playwright or esbuild.
 */
export async function createRunner(
  options: Config = {},
  testFiles?: string[]
): Promise<AnyRunner> {
  const mode = options.mode ?? defaultOptions.mode
  if (mode === 'node') {
    return new NodeRunner(options, testFiles)
  }
  if (mode === 'workerd') {
    const { WorkerdRunner } = await import('./workerd/runner.ts')
    return new WorkerdRunner(options, testFiles)
  }
  if (mode === 'browser' || mode === 'web-worker') {
    const { Runner } = await import('./runner.ts')
    return new Runner(options, testFiles)
  }
  throw new UsageError(
    `Invalid mode "${mode}", expected "browser", "web-worker", "node" or "workerd".`
  )
}

/**
 * Run tests programmatically without exiting the host process.
 */
export async function run(
  options: Config = {},
  testFiles?: string[]
): Promise<RunResult> {
  const runner = await createRunner(options, testFiles)
  return await runner.run()
}

/**
 * Run tests in watch mode programmatically. Call `stop()` on the returned
 * handle to close the watcher and clean up.
 */
export async function watch(
  options: Config = {},
  testFiles?: string[]
): Promise<WatchHandle> {
  const runner = await createRunner(options, testFiles)
  return await runner.watch()
}
