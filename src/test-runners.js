import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('./types.js').TestRunner} */
export const mocha = {
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
import mocha from 'mocha/mocha.js'

const { allowUncaught, bail, reporter, timeout, color, ui, grep } =
  process.env.PW_TEST.testRunner.options
mocha.setup({
  allowUncaught,
  bail,
  reporter,
  timeout,
  color,
  ui,
  grep,
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
  options: {},
  compileRuntime(options, paths) {
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
      return { path: require.resolve('./empty-fs.js') }
    })
  },
}

/**
 * Tape test runner
 *
 * @type {import('./types.js').TestRunner}
 */
export const tape = {
  buildConfig: {
    plugins: [tapeEsbuildPlugin],
    inject: [path.join(__dirname, 'node-globals-buffer.js')],
  },
  compileRuntime(options, paths) {
    return `
import { onFailure, onFinish } from 'tape'

self.TAPE_RUN_FAIL = false

onFailure(() => {
  self.TAPE_RUN_FAIL = true
})

onFinish(() => {
  process.exit(self.TAPE_RUN_FAIL ? 1 : 0)
})

${paths.map((url) => `await import('${url}')`).join('\n')}
`
  },
}

/** @type {import('./types.js').TestRunner} */
export const benchmark = {
  options: {},
  buildConfig: {
    plugins: [
      {
        name: 'swap benchmark',
        setup(build) {
          build.onResolve({ filter: /^benchmark$/ }, () => {
            return { path: path.join(__dirname, 'setup-bench.js') }
          })
        },
      },
    ],
  },
  compileRuntime(options, paths) {
    return `
${paths.map((url) => `await import('${url}')`).join('\n')}
`
  },
}

/** @type {import('./types.js').TestRunner} */
export const uvu = {
  options: {},
  compileRuntime(options, paths) {
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
    process.exit(0)
})
`
  },
}

/** @type {import('./types.js').TestRunner} */
export const zora = {
  options: {},
  compileRuntime(options, paths) {
    return `
const {hold, report, createTAPReporter} = await import('zora')
hold()

${paths.map((url) => `await import('${url}')`).join('\n')}

const out = report({
    reporter: createTAPReporter()
}).then((r) => {
    process.exit(process.exitCode)
})
        
`
  },
}
