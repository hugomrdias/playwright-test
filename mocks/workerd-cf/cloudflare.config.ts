import { bindings, defineConfig, exports } from 'cf/config'

// The same worker as the wrangler fixture
import * as entrypoint from '../workerd/src/index.js' with { type: 'cf-worker' }

export default defineConfig(({ mode }) => ({
  worker: {
    name: 'playwright-test-cf-fixture',
    entrypoint,
    compatibilityDate: '2026-11-01',
    env: {
      GREETING: bindings.text(`hello from ${mode}`),
      KV: bindings.kv(),
      COUNTER: bindings.durableObject({
        worker: 'playwright-test-cf-fixture',
        exportName: 'Counter',
      }),
    },
    exports: {
      Counter: exports.durableObject({ storage: 'sqlite' }),
    },
  },
}))
