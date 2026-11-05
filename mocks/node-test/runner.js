/**
 * Drives the `node:test` compatible API the way the taps runner does.
 *
 * @type {import('../../src/types.js').TestRunner}
 */
export const playwrightTestRunner = {
  moduleId: 'playwright-test/taps/node-test',
  compileRuntime(_options, paths) {
    return `
const { exec, hold } = await import('playwright-test/taps/node-test')
hold()
${paths.map((url) => `await import('${url}')`).join('\n')}

exec().then(() => {
  process.exit(process.exitCode)
})
`
  },
}
