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
import { isAgent } from 'std-env'
import { fileURLToPath, pathToFileURL } from 'url'
import { NodeRunner } from './src/node/runner.js'
import { Runner } from './src/runner.js'
import { detectTestRunners } from './src/utils/auto-detect.js'
import { isColorForced } from './src/utils/force-color.js'
import {
  defaultOptions,
  findTests,
  log,
  UsageError,
} from './src/utils/index.js'
import { toRegExp } from './src/utils/name-pattern.js'

if (isAgent && !isColorForced()) {
  kleur.enabled = false
}

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
    ${kleur.dim('$ playwright-test test.js --runner mocha')}
    ${kleur.dim('$ playwright-test test --debug')}
    ${kleur.dim(
      '$ playwright-test "test/**/*.spec.js" --browser webkit --mode worker --incognito --debug'
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
    ${kleur.dim('$ DEBUG=app playwright-test test.js')}

    Do not let your shell expand globs, always wrap them.
    ${kleur.dim('$ playwright-test "test/**"')} GOOD
    ${kleur.dim('$ playwright-test test/**')} BAD

    A path that exists is used as is, even with glob characters in it.
    ${kleur.dim('$ playwright-test "app/[id].test.js"')}

    It exits with 1 when no test files are found.
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

/**
 * Pick the test runner from what the test files use, or `none`.
 *
 * @param {string[]} testFiles
 * @returns {import('./src/types.js').RunnerOptions['runner']}
 */
function autoDetectTestRunner(testFiles) {
  const found = detectTestRunners(testFiles)

  if (found.size > 1) {
    const list = [...found].map(
      ([runner, file]) => `"${runner.moduleId}" (${file})`
    )
    throw new UsageError(
      `Found more than one test runner: ${list.join(', ')}. Choose one with --runner or runner in the config file.`
    )
  }

  const [runner] = found.keys()
  if (runner) {
    log.info(`Autodetected "${runner.moduleId}" as the runner.`)
    return runner.name
  }
  if (testFiles.length > 0) {
    log.warn('Could not find a test runner. Using "none".')
  }
  return 'none'
}

const KNOWN_FLAGS = new Set([
  '_',
  'assets',
  'b',
  'before',
  'browser',
  'config',
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
function validateOptions({ mode, testNamePattern, testTimeout }) {
  if (!['main', 'worker', 'node'].includes(mode)) {
    throw new UsageError(
      `Invalid mode "${mode}", expected "main", "worker" or "node".`
    )
  }
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
function warnUnsupportedTestOptions({ runner, testNamePattern, testTimeout }) {
  if (runner !== 'none') {
    return
  }
  if (testNamePattern != null) {
    log.warn(
      `The "none" runner can't filter by name, ignoring --test-name-pattern.`
    )
  }
  if (testTimeout != null) {
    log.warn(
      `The "none" runner can't set a default timeout, ignoring --test-timeout.`
    )
  }
}

const configLoaders = {
  '.js': loadEsm,
  '.mjs': loadEsm,
}

/**
 * Not set as the defaults of the cli options, those can't be told apart from a
 * flag and would always win over the config file.
 */
const cliDefaults = {
  browser: defaultOptions.browser,
  cwd: defaultOptions.cwd,
  debug: defaultOptions.debug,
  extension: defaultOptions.extension,
  extensions: defaultOptions.extensions,
  incognito: defaultOptions.incognito,
  mode: defaultOptions.mode,
}

sade2
  .version(version)
  .describe(
    'Run mocha and node:test scripts inside real browsers with `playwright` and in Node.'
  )
  .option(
    '-r, --runner',
    'Test runner. Options: mocha, node-test and none, which only loads the files and is for scripts like benchmarks. Autodetected by default.'
  )
  .option(
    '-b, --browser',
    `Browser to run tests. Options: chromium, firefox, webkit.  (default ${cliDefaults.browser})`
  )
  .option(
    '-m, --mode',
    `Run mode. Options: main, worker and node.  (default ${cliDefaults.mode})`
  )
  .option(
    '-d, --debug',
    `Debug mode, keeps browser window open.  (default ${cliDefaults.debug})`
  )
  .option('-w, --watch', 'Watch files for changes and re-run tests.')
  .option(
    '-i, --incognito',
    `Use incognito window to run tests.  (default ${cliDefaults.incognito})`
  )
  .option(
    '-e, --extension',
    `Use extension background_page to run tests.  (default ${cliDefaults.extension})`
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
  .option('--cwd', `Current directory.  (default ${cliDefaults.cwd})`)
  .option(
    '--extensions',
    `File extensions allowed in the bundle.  (default ${cliDefaults.extensions})`
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
        config.config = await config.config(merge(cliDefaults, opts))
      }

      /**
       * Merge cli options with config file options
       *
       * @type {import('./src/types.js').RunnerOptions}
       */
      const options = merge(cliDefaults, config ? config.config : {}, {
        input: input ? [input, ...opts._] : undefined,
        testFiles: [],
        runner: opts.runner,
        cwd: opts.cwd,
        assets: opts.assets,
        browser: opts.browser,
        debug: opts.debug,
        mode: opts.mode,
        incognito: opts.incognito,
        extension: opts.extension,
        before: opts.before,
        sw: opts.sw,
        extensions: opts.extensions,
        transform: opts.transform,
        runTimeout: opts['run-timeout'],
        testNamePattern: opts['test-name-pattern'],
        testTimeout: opts['test-timeout'],
        beforeTests: opts.beforeTests,
        afterTests: opts.afterTests,
      })
      options.minimal = isAgent
      options.cwd = path.resolve(options.cwd)

      const testFiles = findTests({
        cwd: options.cwd,
        extensions: options.extensions.split(','),
        filePatterns: options.input ?? [],
      })

      validateOptions(options)

      options.runner ??= autoDetectTestRunner(testFiles)
      warnUnsupportedTestOptions(options)

      let runner
      if (options.mode === 'node') {
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
  .parse(process.argv, {
    // Without defaults to tell their types, `--debug test.js` would take the file
    boolean: ['debug', 'extension', 'incognito', 'watch'],
    string: ['browser', 'cwd', 'extensions', 'mode'],
  })
