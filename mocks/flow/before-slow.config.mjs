/** biome-ignore-all lint/suspicious/noConsole: test */
export default {
  beforeTests: async () => {
    // Tests wait for this line to stop the run while the hook runs
    console.log('before-started')
    await new Promise((resolve) => setTimeout(resolve, 1500))
    console.error('before-finished')
  },
  afterTests: () => {
    console.error('after-ran')
    return Promise.resolve()
  },
}
