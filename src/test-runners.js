import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { toRegExp } from './utils/name-pattern.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * `debug` inside `mocha.js` reads `localStorage` while it loads, which warns since
 * Node.js 25 unless there's a file for it. Tests still get what was there.
 */
const importMochaInNode = `
const webStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined })
await import('mocha/mocha.js')
if (webStorage) {
  Object.defineProperty(globalThis, 'localStorage', webStorage)
} else {
  delete globalThis.localStorage
}
globalThis.location={}
`

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
${options.mode === 'node' ? importMochaInNode : "import 'mocha/mocha.js'"}

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
