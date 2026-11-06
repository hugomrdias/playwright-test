export default {
  afterTests: () => {
    throw new Error('after-boom')
  },
}
