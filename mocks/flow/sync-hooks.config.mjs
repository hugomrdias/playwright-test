/** biome-ignore-all lint/suspicious/noConsole: test */
export default {
  // Not async, config files in plain JS can have these
  beforeTests() {
    return 'sync-before'
  },
  afterTests(_env, output) {
    console.error(`after-got:${output}`)
  },
}
