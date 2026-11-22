import type {
  BuildOptions as ESBuildOptions,
  Plugin as ESBuildPlugin,
} from 'esbuild'
import { build } from 'esbuild'
// @ts-expect-error
import mergeOptions from 'merge-options'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Runner } from '../runner.ts'
import { EXT } from './ext.ts'
import { polyfillAliases } from './polyfill-aliases.ts'

const merge = mergeOptions.bind({
  ignoreUndefined: true,
  concatArrays: true,
})

const ENV_MODULE = 'playwright-test:env'

/**
 * Build the bundle
 *
 * @param opts - Runner esbuild config
 */
export async function compileSw(
  runner: Runner,
  {
    entry,
  }: {
    entry: string
  }
) {
  const files = new Set<string>()
  const outName = 'sw-out.js'
  const outPath = path.join(runner.dir, outName)
  // Imports run first and service workers can't wait for a dynamic one, so the
  // env has to be an import to be set when the entry runs.
  const content = `
import ${JSON.stringify(ENV_MODULE)}
import ${JSON.stringify(path.resolve(runner.options.cwd, entry).replaceAll('\\', '/'))}

self.addEventListener('install', function(event) {
  self.skipWaiting();
})
self.addEventListener('activate', (event) => {
  return self.clients.claim()
})
`
  const envPlugin: ESBuildPlugin = {
    name: 'env',
    setup(build) {
      build.onResolve({ filter: new RegExp(`^${ENV_MODULE}$`) }, (args) => ({
        path: args.path,
        namespace: ENV_MODULE,
      }))
      build.onLoad({ filter: /.*/, namespace: ENV_MODULE }, () => ({
        contents: `Object.assign(process.env, ${JSON.stringify(runner.env)})`,
      }))
    },
  }
  const watchPlugin: ESBuildPlugin = {
    name: 'watcher',
    setup(build) {
      build.onLoad({ filter: /.*/, namespace: 'file' }, (args) => {
        if (args.path !== outPath) {
          files.add(args.path)
        }
      })
    },
  }

  const defaultOptions: ESBuildOptions = {
    stdin: {
      contents: content,
      resolveDir: runner.options.cwd,
    },
    bundle: true,
    format: 'esm',
    sourcemap: 'inline',
    plugins: [envPlugin, watchPlugin],
    alias: polyfillAliases,
    inject: [
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        `inject-process${EXT}`
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
