import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { toRegExp } from './utils/name-pattern.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('./types.js').TestRunner} */
export const mocha = {
  moduleId: 'mocha',
  supports: ['testNamePattern', 'testTimeout'],
  options: {
    allowUncaught: false,
    bail: true,
    reporter: 'spec',
    timeout: 5000,
    color: true,
    ui: 'bdd',
  },
  compileRuntime(options, paths) {
    return `
import 'mocha/mocha.js'
${options.mode === 'node' ? 'globalThis.location={}' : ''}

const mocha = globalThis.mocha

const options = JSON.parse(process.env.PW_OPTIONS)
const { allowUncaught, bail, reporter, timeout, color, ui, grep } = options.testRunner.options

mocha.setup({
  allowUncaught,
  bail,
  reporter,
  timeout: options.testTimeout ?? timeout,
  color,
  ui,
  grep: ${options.testNamePattern == null ? 'grep' : toRegExp(String(options.testNamePattern))},
})

${paths.map((url) => `await import('${url}')`).join('\n')}

  mocha
    .run((f) =>{
      process.exit(f)
    })
`
  },
}

/** @type {import('./types.js').TestRunner} */
export const none = {
  moduleId: 'none',
  options: {},
  compileRuntime(_options, paths) {
    return `
${paths.map((url) => `await import('${url}')`).join('\n')}
`
  },
}

/** @type {import('esbuild').Plugin} */
const tapeEsbuildPlugin = {
  name: 'swap tape',
  setup(build) {
    build.onResolve({ filter: /^stream$/ }, () => {
      return { path: require.resolve('stream-browserify') }
    })
    build.onResolve({ filter: /^fs$/ }, () => {
      return { path: require.resolve('./utils/resolve-empty-fs.js') }
    })
  },
}

/**
 * Tape test runner
 *
 * @type {import('./types.js').TestRunner}
 */
export const tape = {
  moduleId: 'tape',
  buildConfig: (options) => {
    if (options.mode === 'node') {
      return {}
    }
    return {
      plugins: [tapeEsbuildPlugin],
      inject: [path.join(__dirname, 'utils/inject-buffer.js')],
    }
  },
  compileRuntime(options, paths) {
    return `
${options.mode === 'node' ? 'globalThis.location={}' : ''}
import tape from 'tape'

globalThis.TAPE_RUN_FAIL = false

tape.onFailure(() => {
  globalThis.TAPE_RUN_FAIL = true
})

tape.onFinish(() => {
  process.exit(globalThis.TAPE_RUN_FAIL ? 1 : 0)
})

${paths.map((url) => `await import('${url}')`).join('\n')}
`
  },
}

/** @type {import('./types.js').TestRunner} */
export const uvu = {
  moduleId: 'uvu',
  options: {},
  compileRuntime(_options, paths) {
    return `
globalThis.UVU_DEFER = 1
globalThis.UVU_QUEUE = []
let idx=0;
${paths
  .map(
    (url) =>
      `globalThis.UVU_INDEX = idx++; globalThis.UVU_QUEUE.push(['${url}']);`
  )
  .join('\n')}
        
${paths.map((url) => `await import('${url}')`).join('\n')}
        
const uvu = await import('uvu')
uvu.exec(true).then((r) => {
    process.exit()
})
`
  },
}

const nodeTestFile = path.resolve(__dirname, 'node/test.js')

/**
 * `node:test` runner. In node mode `node:test` is the real thing, with all of
 * its API and reporters, browsers get `playwright-test/node-test` instead. Files
 * importing `playwright-test/node-test` run on it in every mode.
 *
 * @type {import('./types.js').TestRunner}
 */
export const nodeTest = {
  moduleId: 'node:test',
  aliases: ['playwright-test/node-test'],
  supports: ['testNamePattern', 'testTimeout'],
  options: {},
  buildConfig: (options) => {
    if (options.mode === 'node') {
      return {}
    }
    return { alias: { 'node:test': path.normalize(nodeTestFile) } }
  },
  nodeArgs({ testNamePattern, testRunner, testTimeout }) {
    const { reporter } = /** @type {any} */ (testRunner.options ?? {})
    return [
      ...(testNamePattern == null
        ? []
        : [`--test-name-pattern=${testNamePattern}`]),
      // 0 is no timeout, for node that's a test that always times out
      ...(testTimeout ? [`--test-timeout=${testTimeout}`] : []),
      ...[reporter ?? []].flat().map((r) => `--test-reporter=${r}`),
    ]
  },
  compileRuntime(options, paths) {
    const isNode = options.mode === 'node'
    // node needs a file URL for absolute paths on Windows, esbuild needs a path
    const file = isNode
      ? pathToFileURL(nodeTestFile).href
      : nodeTestFile.replaceAll('\\', '/')
    return `
const { configure, exec, hold } = await import('${file}')
configure(JSON.parse(process.env.PW_OPTIONS))
hold()
${paths.map((url) => `await import('${url}')`).join('\n')}

// In node mode the real node:test may still have to run its tests and report
${isNode ? 'await exec()' : 'exec().then(() => {\n  process.exit(process.exitCode)\n})'}
`
  },
}

/**
 * Playwright Test Runner
 *
 * @type {import('./types').TestRunner}
 */
export const taps = {
  moduleId: 'playwright-test/taps',
  supports: ['testNamePattern', 'testTimeout'],
  options: {},
  compileRuntime(_options, paths) {
    return `
const {configure, exec, hold} = await import('playwright-test/taps')
configure(JSON.parse(process.env.PW_OPTIONS))
hold()
${paths.map((url) => `await import('${url}')`).join('\n')}

exec().then(() => {
    process.exit(process.exitCode)
})
`
  },
}

/**
 * Playwright Test Runner
 *
 * @type {import('./types').TestRunner}
 */
export const tapsLocal = {
  moduleId: '../../src/taps/index.js',
  supports: ['testNamePattern', 'testTimeout'],
  options: {},
  compileRuntime(options, paths) {
    const tapsFile = path.resolve(__dirname, 'taps/index.js')
    // node needs a file URL for absolute paths on Windows, esbuild needs a path
    const tapsPath =
      options.mode === 'node'
        ? pathToFileURL(tapsFile).href
        : tapsFile.replaceAll('\\', '/')
    return `
const {configure, exec, hold} = await import('${tapsPath}')
configure(JSON.parse(process.env.PW_OPTIONS))
hold()
${paths.map((url) => `await import('${url}')`).join('\n')}

exec().then(() => {
    process.exit(process.exitCode)
})
`
  },
}
