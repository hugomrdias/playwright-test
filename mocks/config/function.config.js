/**
 * @param {import('../../src/types.ts').CliOptions} cli
 */
export default function config(cli) {
  // The cli defaults are there even without any flags
  return { browser: cli.mode === 'browser' ? 'firefox' : 'chromium' }
}
