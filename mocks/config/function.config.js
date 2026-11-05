/**
 * @param {import('../../src/types.js').CliOptions} cli
 */
export default function config(cli) {
  // The cli defaults are there even without any flags
  return { browser: cli.mode === 'main' ? 'firefox' : 'chromium' }
}
