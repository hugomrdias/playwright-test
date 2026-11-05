import path from 'path'
import { fileURLToPath } from 'url'

const polyfill = (/** @type {string} */ name) =>
  fileURLToPath(new URL(`../polyfills/${name}`, import.meta.url))

/**
 * What bundles resolve Node.js built-ins with our own implementation to.
 *
 * @type {Record<string, string>}
 */
export const polyfillAliases = Object.fromEntries(
  Object.entries({
    assert: 'assert.js',
    'assert/strict': 'assert-strict.js',
    process: 'process.js',
    // Without these esbuild looks for them inside `process.js`
    'process/browser': 'process.js',
    'process/browser.js': 'process.js',
    util: 'util.js',
    'util/types': 'util-types.js',
  }).flatMap(([name, file]) => {
    const target = path.normalize(polyfill(file))
    return [
      [name, target],
      [`node:${name}`, target],
    ]
  })
)
