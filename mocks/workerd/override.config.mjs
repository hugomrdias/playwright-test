// Miniflare 5 worker options, merged over the ones from the worker config
export default {
  workerd: {
    miniflare: {
      config: { env: { GREETING: { type: 'text', value: 'overridden' } } },
    },
  },
}
