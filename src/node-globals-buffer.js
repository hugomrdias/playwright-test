// https://github.com/ionic-team/rollup-plugin-node-polyfills

import { Buffer as b } from 'buffer'

export const Buffer = b
// @ts-ignore
export { default as process } from 'process/browser'
