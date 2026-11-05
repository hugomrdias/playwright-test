/**
 * Preload that makes the fixtures use the real `node:test` so the same file can
 * be run against both implementations and their results compared.
 */
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('src/taps/node-test.js')) {
      return { url: 'node:test', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
