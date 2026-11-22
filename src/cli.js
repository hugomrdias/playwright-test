/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { gracefulExit } from 'exit-hook'
import { isAgent } from 'std-env'
import { resolveOptions } from './cli-options.js'
import { NodeRunner } from './node/runner.js'
import { Runner } from './runner.js'
import { colors, supportsColor } from './utils/colors.js'
import { UsageError } from './utils/index.js'
import { WorkerdRunner } from './workerd/runner.js'

colors.enabled = supportsColor({ minimal: isAgent })

// Handle any uncaught errors
process.once(
  'uncaughtException',
  (/** @type {Error} */ err, /** @type {string} */ origin) => {
    if (!origin || origin === 'uncaughtException') {
      console.error(err)
      gracefulExit(1)
    }
  }
)
process.once('unhandledRejection', (err) => {
  console.error(err)
  gracefulExit(1)
})

/**
 * @param {import('./types.js').RunnerOptions} options
 * @param {string[]} testFiles
 */
function createRunner(options, testFiles) {
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
