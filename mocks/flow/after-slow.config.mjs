/** biome-ignore-all lint/suspicious/noConsole: test */
export default {
  afterTests: async () => {
    await new Promise((resolve) => setTimeout(resolve, 5500))
    console.error('after-finished')
  },
}
