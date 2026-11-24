/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { gracefulExit } from 'exit-hook'
import { isAgent } from 'std-env'
import { resolveOptions } from './cli-options.ts'
import { createRunner } from './create-runner.ts'
import { colors, supportsColor } from './utils/colors.ts'
import { UsageError } from './utils/index.ts'

colors.enabled = supportsColor({ minimal: isAgent })

// Any error nothing handles fails the run, the exit hook still cleans up. Not
// once, an error while it does would end this process before it's done.
const fail = (err: unknown) => {
  console.error(err)
  gracefulExit(1)
}
process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)

// Not awaited at the top level, Node would exit with 13 if the loop ever
// empties before the run ends.
async function main() {
  try {
    const resolved = await resolveOptions(process.argv.slice(2))
    if (!resolved) {
      return
    }
    const runner = await createRunner(
      { ...resolved.options, exitProcess: true },
      resolved.testFiles
    )
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
