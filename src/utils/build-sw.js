/* eslint-disable no-console */
'use strict'

const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')
const merge = require('merge-options').bind({
  ignoreUndefined: true,
  concatArrays: true,
})

/**
 * @typedef {import('../types').RunnerOptions } RunnerOptions
 * @typedef {import('esbuild').Plugin} ESBuildPlugin
 * @typedef {import('esbuild').BuildOptions} ESBuildOptions
 *
 
/**
 * Build the bundle
 *
 * @param {import("../runner")} runner
 * @param {{
 * out: string,
 * entry: string
 * }} opts - Runner esbuild config
 */
async function compileSw(runner, { out, entry }) {
  const outfile = path.join(runner.dir, out)
  const infile = path.join(runner.dir, 'in.js')
  const infileContent = `
process.env = ${JSON.stringify(runner.env)}
self.addEventListener('activate', (event) => {
  return self.clients.claim()
})

import "${path.join(runner.options.cwd, entry)}"
`

  fs.writeFileSync(infile, infileContent)
  /** @type {ESBuildOptions} */
  const defaultOptions = {
    entryPoints: [infile],
    bundle: true,
    format: 'esm',
    sourcemap: 'inline',
    inject: [path.join(__dirname, 'inject-process.js')],
    outfile,
    define: {
      global: 'globalThis',
    },
  }
  await esbuild.build(merge(defaultOptions, runner.options.buildSWConfig))

  return out
}

module.exports = {
  compileSw,
}
