import path from 'path'
import esbuild from 'esbuild'
import { wasmLoader } from 'esbuild-plugin-wasm'
import mergeOptions from 'merge-options'

const merge = mergeOptions.bind({
  ignoreUndefined: true,
  concatArrays: true,
})

/**
 * @typedef {import('../types').RunnerOptions } RunnerOptions
 * @typedef {import('esbuild').Plugin} ESBuildPlugin
 * @typedef {import('esbuild').BuildOptions} ESBuildOptions
 */

/**
 * Build the bundle
 *
 * @param {import("./runner").NodeRunner} runner
 * @param {ESBuildOptions} config - Runner esbuild config
 * @param {string} tmpl
 */
export async function build(runner, config = {}, tmpl = '') {
  const outName = 'node-out.js'
  const outPath = path.join(runner.dir, outName)
  const files = new Set()

  // main script template
  const infileContent = `
  process.env = ${JSON.stringify(runner.env)}
import.meta.env = ${JSON.stringify(runner.env)}
${tmpl}
`

  /** @type {ESBuildPlugin} */
  const watchPlugin = {
    name: 'watcher',
    setup(build) {
      // @ts-ignore
      build.onLoad({ filter: /.*/, namespace: 'file' }, (args) => {
        files.add(args.path)
      })
    },
  }
  /** @type {ESBuildOptions} */
  const defaultOptions = {
    stdin: {
      contents: infileContent,
      resolveDir: runner.options.cwd,
    },
    // sourceRoot: runner.dir,
    bundle: true,
    sourcemap: 'linked',
    platform: 'node',
    format: 'esm',
    banner: {
      js: `
        import {dirname as topLevelDirname} from 'path';
        import { fileURLToPath as topLevelfileURLToPath } from 'url';
        import { createRequire as topLevelCreateRequire } from 'module';
        const require = topLevelCreateRequire(import.meta.url);
        const __filename = topLevelfileURLToPath(import.meta.url);
        const __dirname = topLevelDirname(__filename);
        `,
    },
    plugins: [watchPlugin, wasmLoader()],
    outfile: outPath,
    loader: { '.node': 'copy' },
    define: {
      global: 'globalThis',
      self: 'globalThis',
    },
  }
  await esbuild.build(merge(defaultOptions, config, runner.options.buildConfig))

  return { outName, files }
}
