// @ts-nocheck
// eslint-disable-next-line unicorn/prefer-module
const _process = require('process/browser')

const p = {
  ..._process,
  exit: (code = 0) => {
    if (code === 0) {
      globalThis.PW_TEST.end(false)
    } else {
      globalThis.PW_TEST.end(true)
    }
  },
}

export const process = p
// https://github.com/ionic-team/rollup-plugin-node-polyfills
