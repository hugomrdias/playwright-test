// Miniflare 5 worker options, merged over the ones from cloudflare.config.ts
export default {
  workerd: {
    miniflare: {
      config: { env: { GREETING: { type: 'text', value: 'overridden' } } },
    },
  },
}
