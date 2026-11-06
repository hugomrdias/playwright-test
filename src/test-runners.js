import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { toRegExp } from './utils/name-pattern.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * @param {string[]} paths
 */
const importAll = (paths) =>
  paths.map((url) => `await import(${JSON.stringify(url)})`).join('\n')

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
  name: 'mocha',
  moduleId: 'mocha',
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

${importAll(paths)}

  mocha
    .run((f) =>{
      process.exit(f)
    })
`
  },
}

/**
 * Only loads the files, for scripts like benchmarks. They end the run with
 * `process.exit` and decide what fails it.
 *
 * @type {import('./types.js').TestRunner}
 */
export const none = {
  name: 'none',
  options: {},
  compileRuntime(_options, paths) {
    return `
${importAll(paths)}
`
  },
}

const nodeTestFile = path.resolve(__dirname, 'node/test.js')
const nodeTestHarnessFile = path.resolve(__dirname, 'node/test-harness.js')

/**
 * `node:test` runner. In node mode `node:test` is the real thing, with all of
 * its API and reporters, browsers get `playwright-test/node-test` instead. Files
 * importing `playwright-test/node-test` run on it in every mode.
 *
 * @type {import('./types.js').TestRunner}
 */
export const nodeTest = {
  name: 'node-test',
  moduleId: 'node:test',
  aliases: ['playwright-test/node-test'],
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
      ? pathToFileURL(nodeTestHarnessFile).href
      : nodeTestHarnessFile.replaceAll('\\', '/')
    return `
const { configure, exec, hold } = await import(${JSON.stringify(file)})
configure(JSON.parse(process.env.PW_OPTIONS))
hold()
${importAll(paths)}

// In node mode the real node:test may still have to run its tests and report
${isNode ? 'await exec()' : 'exec().then(() => {\n  process.exit(process.exitCode)\n})'}
`
  },
}
