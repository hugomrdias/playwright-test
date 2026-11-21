/** biome-ignore-all lint/suspicious/noConsole: test */
const delay = Number(process.env.FLOW_AFTER_DELAY) || 5500

export default {
  afterTests: async () => {
    await new Promise((resolve) => setTimeout(resolve, delay))
    console.error('after-finished')
  },
}
