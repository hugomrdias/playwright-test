import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('./types.js').TestRunner} */
export const mocha = {
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
import mocha from 'mocha/mocha.js'
${options.mode === 'node' ? `globalThis.location={}` : ``}

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
  moduleId: 'none',
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
${options.mode === 'node' ? `globalThis.location={}` : ``}
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
  moduleId: 'benchmark',
  buildConfig: (options) => {
    if (options.mode === 'node') {
      return {}
    }
    return {
      plugins: [
        {
          name: 'swap benchmark',
          setup(build) {
            build.onResolve({ filter: /^benchmark$/ }, () => {
              return { path: path.join(__dirname, 'utils/proxy-benchmark.js') }
            })
          },
        },
      ],
    }
  },
  compileRuntime(options, paths) {
    return `
${paths.map((url) => `await import('${url}')`).join('\n')}
`
  },
}

/** @type {import('./types.js').TestRunner} */
export const uvu = {
  moduleId: 'uvu',
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
    process.exit()
})
`
  },
}

/** @type {import('./types.js').TestRunner} */
export const zora = {
  moduleId: 'zora',
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

/**
 * Playwright Test Runner
 *
 * @type {import('./types').TestRunner}
 */
export const taps = {
  moduleId: 'playwright-test/taps',
  options: {},
  compileRuntime(options, paths) {
    return `
process.env.FORCE_COLOR = 1
const {exec, hold} = await import('playwright-test/taps')
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
  options: {},
  compileRuntime(options, paths) {
    const tapsPath = path.resolve(__dirname, 'taps/index.js')
    return `
process.env.FORCE_COLOR = 1
const {exec, hold} = await import('${tapsPath}')
hold()
${paths.map((url) => `await import('${url}')`).join('\n')}

exec().then(() => {
    process.exit(process.exitCode)
})
`
  },
}
