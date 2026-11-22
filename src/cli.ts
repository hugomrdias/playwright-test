/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { gracefulExit } from 'exit-hook'
import { isAgent } from 'std-env'
import { resolveOptions } from './cli-options.ts'
import { NodeRunner } from './node/runner.ts'
import { Runner } from './runner.ts'
import type { RunnerOptions } from './types.ts'
import { colors, supportsColor } from './utils/colors.ts'
import { UsageError } from './utils/index.ts'
import { WorkerdRunner } from './workerd/runner.ts'

colors.enabled = supportsColor({ minimal: isAgent })

// Handle any uncaught errors
process.once('uncaughtException', (err: Error, origin: string) => {
  if (!origin || origin === 'uncaughtException') {
    console.error(err)
    gracefulExit(1)
  }
})
process.once('unhandledRejection', (err) => {
  console.error(err)
  gracefulExit(1)
})

function createRunner(options: RunnerOptions, testFiles: string[]) {
  if (options.mode === 'node') {
    return new NodeRunner(options, testFiles)
  }
  if (options.mode === 'workerd') {
    return new WorkerdRunner(options, testFiles)
  }
  return new Runner(options, testFiles)
}

// Not awaited at the top level, Node would exit with 13 if the loop ever
// empties before the run ends.
async function main() {
  try {
    const resolved = await resolveOptions(process.argv.slice(2))
    if (!resolved) {
      return
    }
    const runner = createRunner(resolved.options, resolved.testFiles)
    if (resolved.watch) {
      await runner.watch()
    } else {
      await runner.run()
    }
  } catch (error) {
    console.error(error instanceof UsageError ? error.message : error)
    gracefulExit(1)
  }
}

main()
