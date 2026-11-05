#!/usr/bin/env node

/** biome-ignore-all lint/suspicious/noConsole: its ok */

import { gracefulExit } from 'exit-hook'
import fs from 'fs'
import kleur from 'kleur'
import { lilconfig } from 'lilconfig'
// @ts-expect-error
import mergeOptions from 'merge-options'
import path from 'path'
import sade from 'sade'
import { fileURLToPath, pathToFileURL } from 'url'
import { NodeRunner } from './src/node/runner.js'
import { Runner } from './src/runner.js'
import * as DefaultRunners from './src/test-runners.js'
import { detectTestRunners } from './src/utils/auto-detect.js'
import {
  defaultOptions,
  findTests,
  log,
  resolveTestRunner,
} from './src/utils/index.js'
import { toRegExp } from './src/utils/name-pattern.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
)

const merge = mergeOptions.bind({ ignoreUndefined: true })

// Handle any uncaught errors
process.once(
  'uncaughtException',
  (/** @type {Error} */ err, /** @type {string} */ origin) => {
    if (!origin || origin === 'uncaughtException') {
      console.error(err)
      gracefulExit(1)
    }
  }
)
process.once('unhandledRejection', (err) => {
  console.error(err)
  gracefulExit(1)
})

const extra = `
  ${kleur.bold('Examples')}
    ${kleur.dim('$ playwright-test test.js --runner tape')}
    ${kleur.dim('$ playwright-test test --debug')}
    ${kleur.dim(
      '$ playwright-test "test/**/*.spec.js" --browser webkit --mode worker --incognito --debug'
    )}

    ${kleur.dim('$ playwright-test bench.js --runner benchmark')}
    ${kleur.gray(
      '# Uses benchmark.js to run your benchmark see playwright-test/mocks/benchmark.js for an example.'
    )}

    ${kleur.dim(
      '$ playwright-test test --cov && npx nyc report --reporter=html'
    )}
    ${kleur.gray(
      '# Enable code coverage in istanbul format which can be used by nyc.'
    )}

    ${kleur.dim(
      '$ playwright-test "test/**/*.spec.js" --debug --before ./mocks/before.js'
    )}
    ${kleur.gray(
      '# Run a script in a separate tab. Check ./mocks/before.js for an example.\n    # Important: You need to call `self.PW_TEST.beforeEnd()` to start the main script.'
    )}

  ${kleur.bold('Runner Options')}
    Everything else a runner takes goes in the config file, under \`testRunner.options\`.
    Check https://github.com/hugomrdias/playwright-test#runner-options

  ${kleur.bold('Notes')}
    DEBUG env var filtering for 'debug' package logging will work as expected.
    ${kleur.dim('$ DEBUG:app playwright-test test.js')}

    Do not let your shell expand globs, always wrap them.
    ${kleur.dim('$ playwright-test "test/**"')} GOOD
    ${kleur.dim('$ playwright-test test/**')} BAD

    A path that exists is used as is, even with glob characters in it.
    ${kleur.dim('$ playwright-test "app/[id].test.js"')}
`

const sade2 = new Proxy(sade('playwright-test [files]', true), {
  get: (target, prop, receiver) => {
    const targetValue = Reflect.get(target, prop, receiver)

    if (typeof targetValue === 'function') {
      return function (/** @type {any} */ ...args) {
        // @ts-expect-error
        const out = targetValue.apply(this, args)

        if (prop === 'help') {
          console.log(extra)
        }

        return out
      }
    }

    return targetValue
  },
})

const loadEsm = async (/** @type {string} */ filepath) => {
  /** @type {any} */
  const res = await import(pathToFileURL(filepath).toString())
  if (res.default) {
    return res.default
  }

  return res
}

/** An error that only needs its message shown. */
class UsageError extends Error {}

/** @type {Record<string, import('./src/types.js').TestRunner>} */
const builtInRunners = {
  benchmark: DefaultRunners.benchmark,
  mocha: DefaultRunners.mocha,
  'node-test': DefaultRunners.nodeTest,
  none: DefaultRunners.none,
  taps: DefaultRunners.taps,
  tape: DefaultRunners.tape,
  uvu: DefaultRunners.uvu,
}

/**
 * Pick the test runner from what the test files use, or `none`.
 *
 * @param {string[]} testFiles
 */
function autoDetectTestRunner(testFiles) {
  const found = detectTestRunners(testFiles, DefaultRunners)

  if (found.size > 1) {
    const list = [...found].map(
      ([runner, file]) => `"${runner.moduleId}" (${file})`
    )
    throw new UsageError(
      `Found more than one test runner: ${list.join(', ')}. Choose one with --runner.`
    )
  }

  const [runner] = found.keys()
  if (runner) {
    log.info(`Autodetected "${runner.moduleId}" as the runner.`)
    return runner
  }
  if (testFiles.length > 0) {
    log.warn('Could not find a test runner. Using "none".')
  }
  return DefaultRunners.none
}

const KNOWN_FLAGS = new Set([
  '_',
  'assets',
  'b',
  'before',
  'browser',
  'config',
  'cov',
  'cwd',
  'd',
  'debug',
  'e',
  'extension',
  'extensions',
  'i',
  'incognito',
  'm',
  'mode',
  'no-transform',
  'r',
  'report-dir',
  'run-timeout',
  'runner',
  'sw',
  'test-name-pattern',
  'test-timeout',
  'transform',
  'w',
  'watch',
])

/**
 * Nothing is forwarded to the runners, ignoring a flag would run the wrong tests.
 * Not the `unknown` option of sade since it also rejects `--no-transform`.
 *
 * @param {Record<string, unknown>} opts
 */
function checkUnknownFlags(opts) {
  const unknown = Object.keys(opts).filter((flag) => !KNOWN_FLAGS.has(flag))
  if (unknown.length > 0) {
    const flags = unknown.map((flag) =>
      flag.length === 1 ? `-${flag}` : `--${flag}`
    )
    throw new UsageError(
      `Unknown option ${flags.join(', ')}. Runner options go in the config file, under testRunner.options. See also --test-name-pattern and --test-timeout.`
    )
  }
}

/**
 * @param {import('./src/types.js').RunnerOptions} options
 */
function validateTestOptions({ testNamePattern, testTimeout }) {
  if (Array.isArray(testNamePattern)) {
    throw new UsageError(
      '--test-name-pattern can only be set once, use a regular expression like "a|b".'
    )
  }
  if (testNamePattern != null) {
    try {
      toRegExp(String(testNamePattern))
    } catch (error) {
      throw new UsageError(
        `Invalid --test-name-pattern: ${/** @type {Error} */ (error).message}`
      )
    }
  }
  if (
    testTimeout != null &&
    !(typeof testTimeout === 'number' && testTimeout >= 0)
  ) {
    throw new UsageError(
      '--test-timeout must be a number of milliseconds, 0 for none.'
    )
  }
}

/**
 * @param {import('./src/types.js').RunnerOptions} options
 */
function warnUnsupportedTestOptions({
  testNamePattern,
  testRunner,
  testTimeout,
}) {
  const supports = testRunner.supports ?? []
  if (testNamePattern != null && !supports.includes('testNamePattern')) {
    log.warn(
      `The "${testRunner.moduleId}" runner can't filter by name, ignoring --test-name-pattern.`
    )
  }
  if (testTimeout != null && !supports.includes('testTimeout')) {
    log.warn(
      `The "${testRunner.moduleId}" runner can't set a default timeout, ignoring --test-timeout.`
    )
  }
}

const configLoaders = {
  '.js': loadEsm,
  '.mjs': loadEsm,
}

sade2
  .version(version)
  .describe(
    'Run mocha, uvu, tape and benchmark.js scripts inside real browsers with `playwright` and in Node.'
  )
  .option(
    '-r, --runner',
    'Test runner. Options: mocha, tape, uvu, none, taps, node-test and benchmark. It also accepts a path to a module or a module name that exports a `playwrightTestRunner` object.'
  )
  .option(
    '-b, --browser',
    'Browser to run tests. Options: chromium, firefox, webkit.',
    defaultOptions.browser
  )
  .option(
    '-m, --mode',
    'Run mode. Options: main, worker and node.',
    defaultOptions.mode
  )
  .option(
    '-d, --debug',
    'Debug mode, keeps browser window open.',
    defaultOptions.debug
  )
  .option('-w, --watch', 'Watch files for changes and re-run tests.')
  .option(
    '-i, --incognito',
    'Use incognito window to run tests.',
    defaultOptions.incognito
  )
  .option(
    '-e, --extension',
    'Use extension background_page to run tests.',
    defaultOptions.extension
  )
  .option(
    '--cov',
    "Enable code coverage in istanbul format. Outputs '.nyc_output/coverage-pw.json'.",
    defaultOptions.cov
  )
  .option(
    '--report-dir',
    'Where to output code coverage in instanbul format.',
    defaultOptions.reportDir
  )
  .option(
    '--before',
    'Path to a script to be loaded on a separate tab before the main script.'
  )
  .option('--sw', 'Path to a script to be loaded in a service worker.')
  .option(
    '--assets',
    'Folder with assets to be served by the http server.  (default process.cwd())'
  )
  .option('--cwd', 'Current directory.', defaultOptions.cwd)
  .option(
    '--extensions',
    'File extensions allowed in the bundle.',
    defaultOptions.extensions
  )
  .option(
    '--no-transform',
    'Node mode only. Run files as plain Node would, without the built-in esbuild transform.'
  )
  .option(
    '--run-timeout',
    'Fail the run after this many milliseconds, 0 turns it off. Not used with --debug or --watch.  (default 1800000)'
  )
  .option(
    '--test-name-pattern',
    'Only run tests whose name matches this regular expression or /expression/flags.'
  )
  .option(
    '--test-timeout',
    'Timeout in milliseconds for tests without their own, 0 for none.'
  )
  .option('--config', 'Path to the config file')
  .action(async (input, opts) => {
    let config
    try {
      checkUnknownFlags(opts)

      if (opts.config) {
        config = await lilconfig('playwright-test', {
          loaders: configLoaders,
        }).load(path.resolve(opts.config))
      } else {
        config = await lilconfig('playwright-test', {
          loaders: configLoaders,
        }).search()
        if (!config) {
          config = await lilconfig('pw-test', {
            loaders: configLoaders,
          }).search()
        }
      }

      // if the supplied config module was a function, invoke it
      if (config && typeof config.config === 'function') {
        config.config = await config.config(opts)
      }

      /**
       * Merge cli options with config file options
       *
       * @type {import('./src/types.js').RunnerOptions}
       */
      const options = merge(config ? config.config : {}, {
        input: input ? [input, ...opts._] : undefined,
        testFiles: [],
        cwd: opts.cwd,
        assets: opts.assets,
        browser: opts.browser,
        debug: opts.debug,
        mode: opts.mode,
        incognito: opts.incognito,
        extension: opts.extension,
        before: opts.before,
        sw: opts.sw,
        cov: opts.cov,
        reportDir: opts['report-dir'],
        extensions: opts.extensions,
        transform: opts.transform,
        runTimeout: opts['run-timeout'],
        testNamePattern: opts['test-name-pattern'],
        testTimeout: opts['test-timeout'],
        beforeTests: opts.beforeTests,
        afterTests: opts.afterTests,
      })

      const testFiles = findTests({
        cwd: options.cwd,
        extensions: options.extensions.split(','),
        filePatterns: options.input ?? [],
      })

      validateTestOptions(options)

      /** @type {Partial<import('./src/types.js').TestRunner> | undefined} */
      const configured = options.testRunner
      /** @type {import('./src/types.js').TestRunner} */
      let testRunner
      if (opts.runner) {
        testRunner = Object.hasOwn(builtInRunners, opts.runner)
          ? builtInRunners[opts.runner]
          : await resolveTestRunner(opts.runner, opts.cwd)
      } else if (configured?.compileRuntime) {
        testRunner = /** @type {import('./src/types.js').TestRunner} */ (
          configured
        )
      } else {
        testRunner = autoDetectTestRunner(testFiles)
      }
      options.testRunner = merge(testRunner, { options: configured?.options })
      warnUnsupportedTestOptions(options)

      let runner
      if (opts.mode === 'node') {
        runner = new NodeRunner(options, testFiles)
      } else {
        runner = new Runner(options, testFiles)
      }

      if (opts.watch) {
        runner.watch()
      } else {
        runner.run()
      }
    } catch (error) {
      console.error(error instanceof UsageError ? error.message : error)
      gracefulExit(1)
    }
  })
  .parse(process.argv)
