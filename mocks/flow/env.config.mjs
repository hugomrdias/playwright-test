export default {
  beforeTests: (env) => {
    env.FLOW_BEFORE = 'from-before-tests'
  },
}
