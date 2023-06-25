/* eslint-disable no-console */

import path from 'path'
import { build } from 'esbuild'
import mergeOptions from 'merge-options'
import { fileURLToPath } from 'url'
import { temporaryWriteSync } from 'tempy'

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
 * entry: string
 * }} opts - Runner esbuild config
 */
export async function compileSw(runner, { entry }) {
  const files = new Set()
  const outName = 'sw-out.js'
  const outPath = path.join(runner.dir, outName)
  const content = `
process.env = ${JSON.stringify(runner.env)}
self.addEventListener('install', function(event) {
  self.skipWaiting();
})
self.addEventListener('activate', (event) => {
  return self.clients.claim()
})

import "${path.join(runner.options.cwd, entry).replace(/\\/g, '/')}"
`
  const entryPoint = temporaryWriteSync(content, { extension: 'js' })
  /** @type {ESBuildPlugin} */
  const watchPlugin = {
    name: 'watcher',
    setup(build) {
      // @ts-ignore
      build.onLoad({ filter: /.*/, namespace: 'file' }, (args) => {
        if (args.path !== outPath && args.path !== entryPoint) {
          files.add(args.path)
        }
      })
    },
  }

  /** @type {ESBuildOptions} */
  const defaultOptions = {
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    sourcemap: 'inline',
    plugins: [watchPlugin],
    inject: [
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'inject-process.js'
      ),
    ],
    outfile: outPath,
    define: {
      global: 'globalThis',
    },
  }
  await build(merge(defaultOptions, runner.options.buildSWConfig))

  return { files, outName }
}
