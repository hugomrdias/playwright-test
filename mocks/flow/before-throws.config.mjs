/** biome-ignore-all lint/suspicious/noConsole: test */
export default {
  beforeTests: () => Promise.reject(new Error('before-boom')),
  afterTests: () => {
    console.error('after-ran')
    return Promise.resolve()
  },
}
