/**
 * `node:util` that works in browsers and in Node.js, where it is the built-in.
 * Bundles resolve `util` to `src/polyfills/util.js`.
 *
 * The named exports are the ones both have and that aren't deprecated. The default
 * export is the whole module, which has more in Node.js.
 */
import util from 'util'

export const {
  callbackify,
  debug,
  debuglog,
  deprecate,
  format,
  formatWithOptions,
  inherits,
  inspect,
  isDeepStrictEqual,
  promisify,
  stripVTControlCharacters,
  TextDecoder,
  TextEncoder,
  toUSVString,
  types,
} = util

export default util
