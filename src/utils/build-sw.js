/* eslint-disable no-console */

import { writeFileSync } from 'fs'
import path from 'path'
import { build } from 'esbuild'
import mergeOptions from 'merge-options'
import { fileURLToPath } from 'url'

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
  const outfile = path.join(runner.dir, out)
  const infile = path.join(runner.dir, 'in.js')
  const infileContent = `
process.env = ${JSON.stringify(runner.env)}
self.addEventListener('activate', (event) => {
  return self.clients.claim()
})

import "${path.join(runner.options.cwd, entry).replace(/\\/g, '/')}"
`

  writeFileSync(infile, infileContent)
  /** @type {ESBuildOptions} */
  const defaultOptions = {
    entryPoints: [infile],
    bundle: true,
    format: 'esm',
    sourcemap: 'inline',
    inject: [
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'inject-process.js'
      ),
    ],
    outfile,
    define: {
      global: 'globalThis',
    },
  }
  await build(merge(defaultOptions, runner.options.buildSWConfig))

  return out
}
