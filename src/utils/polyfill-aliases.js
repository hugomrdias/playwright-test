import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const polyfill = (/** @type {string} */ name) =>
  fileURLToPath(new URL(`../polyfills/${name}`, import.meta.url))

const pathBrowserify = createRequire(import.meta.url).resolve('path-browserify')

/**
 * What bundles resolve Node.js built-ins to: our own implementation, or
 * `path-browserify` for `path`.
 *
 * @type {Record<string, string>}
 */
export const polyfillAliases = Object.fromEntries(
  Object.entries({
    assert: polyfill('assert.js'),
    'assert/strict': polyfill('assert-strict.js'),
    path: pathBrowserify,
    'path/posix': pathBrowserify,
    process: polyfill('process.js'),
    // Without these esbuild looks for them inside `process.js`
    'process/browser': polyfill('process.js'),
    'process/browser.js': polyfill('process.js'),
    util: polyfill('util.js'),
    'util/types': polyfill('util-types.js'),
  }).flatMap(([name, file]) => {
    const target = path.normalize(file)
    return [
      [name, target],
      [`node:${name}`, target],
    ]
  })
)
