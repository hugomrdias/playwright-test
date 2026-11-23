import type {
  BuildOptions as ESBuildOptions,
  Plugin as ESBuildPlugin,
} from 'esbuild'
import { build } from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Runner } from '../runner.ts'
import { EXT } from './ext.ts'
import { createMerge } from './merge.ts'
import { polyfillAliases } from './polyfill-aliases.ts'
import { CLEAR_SITE_DATA_PATH } from './server.ts'

const merge = createMerge({ ignoreUndefined: true, concatArrays: true })

const ENV_MODULE = 'playwright-test:env'
const HARNESS_MODULE = 'playwright-test:harness'

/**
 * First, so the worker of the tests never answers for the pages of the runner.
 * Each file of an isolated run loads the test page again, it's in its scope.
 */
const harness = `
const pages = new Set(['/', ${JSON.stringify(CLEAR_SITE_DATA_PATH)}])
self.addEventListener('fetch', (event) => {
  if (
    event.request.mode === 'navigate' &&
    pages.has(new URL(event.request.url).pathname)
  ) {
    event.stopImmediatePropagation()
  }
})
`

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
  const outPath = path.join(runner.files, outName)
  // Imports run first and service workers can't wait for a dynamic one, so the
  // env has to be an import to be set when the entry runs.
  const content = `
import ${JSON.stringify(HARNESS_MODULE)}
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
      build.onResolve(
        { filter: new RegExp(`^${HARNESS_MODULE}$`) },
        (args) => ({ path: args.path, namespace: HARNESS_MODULE })
      )
      build.onLoad({ filter: /.*/, namespace: HARNESS_MODULE }, () => ({
        contents: harness,
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
  await build(
    merge<ESBuildOptions>(defaultOptions, runner.options.buildSWConfig)
  )

  return { files, outName }
}
