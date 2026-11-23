/**
 * Preloaded by `--mode node` with `--import`. Transforms project files one at a
 * time with esbuild and fills in the resolution Node doesn't do on its own, so
 * tests still run unbundled from their real paths. `node_modules` is untouched.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { findPackageJSON, registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileFunction } from 'node:vm'
import type { BuildOptions, Loader, TransformOptions } from 'esbuild'
import { transformSync } from 'esbuild'

export type Format = 'module' | 'commonjs'

/** Extensions tried, in order, for extensionless and directory imports. */
const EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]

/**
 * What a missing file may be written as, same as tsc and esbuild.
 */
const REWRITES: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.ts', '.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
}

/** Loaders that produce JavaScript from a single file. */
const JS_LOADERS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'json',
  'text',
  'base64',
  'dataurl',
  'binary',
])

const buildConfig: BuildOptions =
  JSON.parse(process.env.PW_OPTIONS ?? '{}').buildConfig ?? {}
// Only what applies to a per-file transform, the rest needs a bundle
const {
  jsx = 'automatic',
  jsxDev,
  jsxFactory,
  jsxFragment,
  jsxImportSource,
  jsxSideEffects,
  tsconfigRaw,
} = buildConfig

const loaders: Record<string, Loader> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  ...Object.fromEntries(
    Object.entries(buildConfig.loader ?? {}).filter(([, loader]) =>
      JS_LOADERS.has(loader)
    )
  ),
}

const define: Record<string, string> = {
  'import.meta.env': 'globalThis.process.env',
  ...buildConfig.define,
}
// Split up since esbuild also matches `a['b']`, `a .b` and comments in between
const defineKeys = Object.keys(define).map((key) => key.split('.'))

const transformOptions: TransformOptions = {
  define,
  jsx,
  jsxDev,
  jsxFactory,
  jsxFragment,
  jsxImportSource,
  jsxSideEffects,
  tsconfigRaw,
  platform: 'node',
  sourcemap: 'inline',
  target: 'node24',
}

function isFile(file: string) {
  return statSync(file, { throwIfNoEntry: false })?.isFile() ?? false
}

/**
 * @param url - file URL
 */
function inDependencies(url: string) {
  return new URL(url).pathname.split('/').includes('node_modules')
}

/**
 * Path a specifier points at, undefined for bare specifiers like `lodash`.
 */
function specifierPath(specifier: string, parentURL: string) {
  if (specifier.startsWith('file:')) {
    return fileURLToPath(specifier)
  }
  if (path.isAbsolute(specifier) || /^\.\.?([/\\]|$)/.test(specifier)) {
    return path.resolve(path.dirname(fileURLToPath(parentURL)), specifier)
  }
}

/**
 * Find the file an import that Node couldn't resolve refers to.
 */
function probe(file: string) {
  const ext = path.extname(file)
  const stem = file.slice(0, file.length - ext.length)
  return [
    ...(REWRITES[ext] ?? []).map((rewrite) => stem + rewrite),
    ...EXTENSIONS.map((extension) => file + extension),
    ...EXTENSIONS.map((extension) => path.join(file, `index${extension}`)),
  ].find(isFile)
}

/**
 * Module format set by the extension or the closest `package.json`.
 */
function declaredFormat(url: string, ext: string): Format | undefined {
  if (ext === '.mts' || ext === '.mjs') {
    return 'module'
  }
  if (ext === '.cts' || ext === '.cjs') {
    return 'commonjs'
  }
  const pkg = findPackageJSON(url)
  const type = pkg ? JSON.parse(readFileSync(pkg, 'utf8')).type : undefined
  return type === 'module' || type === 'commonjs' ? type : undefined
}

/**
 * Same as Node for files with no declared format, they're CommonJS unless they
 * only parse as an ES module.
 */
function detectFormat(code: string): Format {
  try {
    compileFunction(code, [
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
    ])
    return 'commonjs'
  } catch {
    return 'module'
  }
}

/**
 * @param format - left as written and detected when undefined
 */
function transform(
  url: string,
  source: string | Uint8Array,
  loader: Loader,
  format: Format | undefined
) {
  const { code } = transformSync(source, {
    ...transformOptions,
    loader,
    // A file URL is what node resolves back to the original on Windows
    sourcefile: url,
    format: format && (format === 'commonjs' ? 'cjs' : 'esm'),
  })
  return {
    format: format ?? detectFormat(code),
    source: code,
    shortCircuit: true,
  }
}

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      const parentURL = context.parentURL
      if (!parentURL?.startsWith('file:') || inDependencies(parentURL)) {
        throw error
      }
      const file = specifierPath(specifier, parentURL)
      const found = file && probe(file)
      if (!found) {
        throw error
      }
      // Not through `next`, the resolver `require` uses doesn't take file URLs
      return {
        url: pathToFileURL(realpathSync(found)).href,
        shortCircuit: true,
      }
    }
  },

  load(url, context, next) {
    if (!url.startsWith('file:') || inDependencies(url)) {
      return next(url, context)
    }

    const file = fileURLToPath(url)
    const ext = path.extname(file)
    const loader = loaders[ext]
    if (loader) {
      // Not through `next`, it can't load .tsx/.jsx and for a .ts file in a
      // package with no "type" it parses it first, which throws on an enum
      return transform(
        url,
        readFileSync(file),
        loader,
        declaredFormat(url, ext)
      )
    }

    const result = next(url, context)
    if (result.format !== 'module' && result.format !== 'commonjs') {
      return result
    }
    // Node leaves the source of CommonJS modules for its own loader to read
    const source = String(result.source ?? readFileSync(file))
    const usesDefine = defineKeys.some((parts) =>
      parts.every((part) => source.includes(part))
    )
    return usesDefine ? transform(url, source, 'js', result.format) : result
  },
})
