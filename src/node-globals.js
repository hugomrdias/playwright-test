export const process = require('process/browser')
export const global = (typeof global !== "undefined" ? global :
typeof self !== "undefined" ? self :
typeof window !== "undefined" ? window : {})
// https://github.com/ionic-team/rollup-plugin-node-polyfills
