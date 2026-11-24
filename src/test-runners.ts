import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { TestRunner } from './types.ts'
import { EXT } from './utils/ext.ts'
import { toPatterns, toRegExp } from './utils/name-pattern.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const importAll = (paths: string[]) =>
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

/**
 * The `grep` of mocha for `--test-name-pattern`, the one from its options without
 * it. It only takes one, but anything with a `test` method works for several.
 */
function mochaGrep(testNamePattern: string | string[] | undefined) {
  const patterns = toPatterns(testNamePattern).map((p) => String(toRegExp(p)))
  if (patterns.length === 0) {
    return 'grep'
  }
  if (patterns.length === 1) {
    return patterns[0]
  }
  return `{ test: (title) => [${patterns.join(', ')}].some((re) => re.test(title)) }`
}

/**
 * `process.exit` once what was written got out. Writes to a full pipe wait in
 * node and `process.exit` drops them, an empty write calls back after them.
 */
const exitAfterWrites = `
function exitAfterWrites(code) {
  // The result, also if a corked stream never calls back and node ends by itself
  process.exitCode = code
  let pending = 2
  const done = () => {
    if (--pending === 0) {
      process.exit(code)
    }
  }
  process.stdout.write('', done)
  process.stderr.write('', done)
}
`

export const mocha: TestRunner = {
  name: 'mocha',
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
${options.mode === 'node' || options.mode === 'workerd' ? importMochaInNode : "import 'mocha/mocha.js'"}

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
  grep: ${mochaGrep(options.testNamePattern)},
})

${importAll(paths)}

  mocha
    .run((f) =>{
      ${options.mode === 'node' ? 'exitAfterWrites(f)' : 'process.exit(f)'}
    })
${options.mode === 'node' ? exitAfterWrites : ''}
`
  },
}

/**
 * Only loads the files, for scripts like benchmarks. They end the run with
 * `process.exit` and decide what fails it.
 */
export const none: TestRunner = {
  name: 'none',
  options: {},
  compileRuntime(_options, paths) {
    return `
${importAll(paths)}
`
  },
}

const nodeTestFile = path.resolve(__dirname, `node/test${EXT}`)
const nodeTestHarnessFile = path.resolve(__dirname, `node/test-harness${EXT}`)

/**
 * `node:test` runner. In node mode `node:test` is the real thing, with all of
 * its API and reporters, browsers get `playwright-test/node-test` instead. Files
 * importing `playwright-test/node-test` run on it in every mode, but with
 * `--test-isolation process` in node mode, where it's the real one too.
 */
export const nodeTest: TestRunner = {
  name: 'node-test',
  options: {},
  buildConfig: (options) => {
    if (options.mode === 'node') {
      return {}
    }
    return { alias: { 'node:test': path.normalize(nodeTestFile) } }
  },
  nodeArgs({ testNamePattern, testRunner, testTimeout }) {
    const { reporter } = (testRunner.options ?? {}) as {
      reporter?: string | string[]
    }
    return [
      ...toPatterns(testNamePattern).map((p) => `--test-name-pattern=${p}`),
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
