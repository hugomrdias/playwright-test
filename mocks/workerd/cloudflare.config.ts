import { bindings, defineConfig, exports } from 'cf/config'
import * as entrypoint from './src/index.js' with { type: 'cf-worker' }

export default defineConfig(({ mode }) => ({
  worker: {
    name: 'playwright-test-fixture',
    entrypoint,
    compatibilityDate: '2026-11-01',
    env: {
      GREETING: bindings.text('hello'),
      CONFIGURED: bindings.text('from the config'),
      MODE: bindings.text(mode),
      KV: bindings.kv(),
      COUNTER: bindings.durableObject({
        worker: 'playwright-test-fixture',
        exportName: 'Counter',
      }),
    },
    exports: {
      Counter: exports.durableObject({ storage: 'sqlite' }),
    },
  },
}))
