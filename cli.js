#!/usr/bin/env node

import module from 'node:module'

// Reuse V8's compiled code across runs, playwright-core alone is ~7MB of JS.
// It has to run before the CLI's imports are compiled, so they're loaded after.
// Respects NODE_COMPILE_CACHE and NODE_DISABLE_COMPILE_CACHE.
try {
  module.enableCompileCache?.()
} catch {
  // Only a speedup, never fail the CLI for it
}

await import('./src/cli.js')
