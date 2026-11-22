/**
 * The extension of the modules of this package, `.ts` when it runs from its
 * sources and `.js` once built. For paths to them that aren't imports, which
 * the build doesn't rewrite, like esbuild entries and `--import`.
 */
export const EXT = import.meta.url.endsWith('.ts') ? '.ts' : '.js'
