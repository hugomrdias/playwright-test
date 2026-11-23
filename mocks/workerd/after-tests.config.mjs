/** biome-ignore-all lint/suspicious/noConsole: test */
export default {
  afterTests: async () => {
    console.log('after-started')
    // Ticks of a worker still running would come in by now
    await new Promise((resolve) => setTimeout(resolve, 500))
    console.log('after-finished')
  },
}
