/** biome-ignore-all lint/suspicious/noConsole: test */
import { createRequire } from 'node:module'

// Miniflare starts workerd with the spawn of this module, tell when it does
const childProcess = createRequire(import.meta.url)('node:child_process')
const spawn = childProcess.spawn
childProcess.spawn = (command, ...args) => {
  if (String(command).includes('workerd')) {
    console.log('workerd-started')
  }
  return spawn(command, ...args)
}

export default {
  buildConfig: {
    plugins: [
      {
        name: 'slow-bundle',
        setup(build) {
          // Outlasts the run timeout of the test
          build.onStart(
            () => new Promise((resolve) => setTimeout(resolve, 1500))
          )
        },
      },
    ],
  },
  async afterTests() {
    // Long enough for the bundle to finish, and workerd to start after it
    await new Promise((resolve) => setTimeout(resolve, 2500))
  },
}
