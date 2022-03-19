// https://github.com/ionic-team/rollup-plugin-node-polyfills

import { Buffer as b } from 'buffer'

// eslint-disable-next-line unicorn/prefer-export-from
export const Buffer = b
// @ts-ignore
export { default as process } from 'process/browser'
