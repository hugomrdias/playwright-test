/* eslint-disable no-console */

import { writeFileSync } from 'fs'
import { join } from 'path'
import { build } from 'esbuild'
import mergeOptions from 'merge-options'

const merge = mergeOptions.bind({
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
 * @param {import("../runner").Runner} runner
 * @param {{
 * out: string,
 * entry: string
 * }} opts - Runner esbuild config
 */
export async function compileSw(runner, { out, entry }) {
  const outfile = join(runner.dir, out)
  const infile = join(runner.dir, 'in.js')
  const infileContent = `
process.env = ${JSON.stringify(runner.env)}
self.addEventListener('activate', (event) => {
  return self.clients.claim()
})

import "${join(runner.options.cwd, entry).replace(/\\/g, '/')}"
`

  writeFileSync(infile, infileContent)
  /** @type {ESBuildOptions} */
  const defaultOptions = {
    entryPoints: [infile],
    bundle: true,
    format: 'esm',
    sourcemap: 'inline',
    inject: [join(__dirname, 'inject-process.js')],
    outfile,
    define: {
      global: 'globalThis',
    },
  }
  await build(merge(defaultOptions, runner.options.buildSWConfig))

  return out
}
