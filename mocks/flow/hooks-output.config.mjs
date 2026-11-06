/** biome-ignore-all lint/suspicious/noConsole: test */
export default {
  beforeTests: () => Promise.resolve('from-before'),
  afterTests: (env, output) => {
    console.error(`after-got:${typeof env.PW_SERVER}:${output}`)
    return Promise.resolve()
  },
}
