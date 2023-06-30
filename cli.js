#!/usr/bin/env node
/* eslint-disable unicorn/prefer-ternary */
/* eslint-disable complexity */
/* eslint-disable max-depth */
/* eslint-disable no-console */

import path from 'path'
import sade from 'sade'
import kleur from 'kleur'
import { fileURLToPath, pathToFileURL } from 'url'
import { lilconfig } from 'lilconfig'
import mergeOptions from 'merge-options'
import {
  runnerOptions,
  defaultOptions,
  findTests,
  resolveTestRunner,
} from './src/utils/index.js'
import { Runner } from './src/runner.js'
import { NodeRunner } from './src/node/runner.js'
import fs from 'fs'
import { benchmark, mocha, none, tape, uvu, zora } from './src/test-runners.js'
import { detectTestRunner } from './src/utils/auto-detect.js'
import * as DefaultRunners from './src/test-runners.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const { version } = JSON.parse(
  // eslint-disable-next-line unicorn/prefer-json-parse-buffer
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
)

const merge = mergeOptions.bind({ ignoreUndefined: true })

// Handle any uncaught errors
process.once(
  'uncaughtException',
  (/** @type {Error} */ err, /** @type {string} */ origin) => {
    if (!origin || origin === 'uncaughtException') {
      console.error(err)
      process.exit(1)
    }
  }
)
process.once('unhandledRejection', (err) => {
  console.error(err)
  process.exit(1)
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
    All arguments passed to the cli not listed above will be fowarded to the runner.
    ${kleur.dim(
      "$ playwright-test test.js --runner mocha --bail --grep 'should fail'"
    )}

    To send a \`false\` flag use --no-bail.
    Check https://mochajs.org/api/mocha for \`mocha\` options or \`npx mocha --help\`.

  ${kleur.bold('Notes')}
    DEBUG env var filtering for 'debug' package logging will work as expected.
    ${kleur.dim('$ DEBUG:app playwright-test test.js')}

    Do not let your shell expand globs, always wrap them.
    ${kleur.dim('$ playwright-test "test/**"')} GOOD
    ${kleur.dim('$ playwright-test test/**')} BAD
`

const sade2 = new Proxy(sade('playwright-test [files]', true), {
  get: (target, prop, receiver) => {
    const targetValue = Reflect.get(target, prop, receiver)

    if (typeof targetValue === 'function') {
      return function (/** @type {any} */ ...args) {
        // @ts-ignore
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

const configLoaders = {
  '.js': loadEsm,
  '.mjs': loadEsm,
}

sade2
  .version(version)
  .describe(
    'Run mocha, zora, uvu, tape and benchmark.js scripts inside real browsers with `playwright` and in Node.'
  )
  .option(
    '-r, --runner',
    'Test runner. Options: mocha, tape, zora, uvu, none, taps and benchmark. It also accepts a path to a module or a module name that exports a `playwrightTestRunner` object.'
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
  .option('--config', 'Path to the config file')
  .action(async (input, opts) => {
    let config
    try {
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
        config.config = await config.config()
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
        beforeTests: opts.beforeTests,
        afterTests: opts.afterTests,
      })

      const testFiles = findTests({
        cwd: options.cwd,
        extensions: options.extensions.split(','),
        filePatterns: options.input ?? [],
      })

      switch (opts.runner) {
        case 'uvu': {
          options.testRunner = uvu
          break
        }
        case 'zora': {
          options.testRunner = zora
          break
        }
        case 'mocha': {
          options.testRunner = mocha
          break
        }
        case 'tape': {
          options.testRunner = tape
          break
        }
        case 'benchmark': {
          options.testRunner = benchmark
          break
        }
        case 'none': {
          options.testRunner = none
          break
        }

        default: {
          if (opts.runner) {
            options.testRunner = await resolveTestRunner(opts.runner, opts.cwd)
          } else {
            const testRunner =
              options.testRunner ??
              (detectTestRunner(testFiles[0], DefaultRunners) ||
                DefaultRunners.none)
            options.testRunner = testRunner

            if (testRunner.moduleId === 'none') {
              console.log(
                '[playwright-test]',
                kleur.yellow('Count not find a test runner. Using "none".')
              )
            } else {
              console.log(
                '[playwright-test]',
                kleur.cyan(
                  `Autodetected "${testRunner.moduleId}" as the runner.`
                )
              )
            }
          }
        }
      }

      let runner
      if (opts.mode === 'node') {
        runner = new NodeRunner(
          merge(options, {
            testRunner: {
              // merge cli redirected options
              options: runnerOptions(opts),
            },
          }),
          testFiles
        )
      } else {
        runner = new Runner(
          merge(options, {
            testRunner: {
              // merge cli redirected options
              options: runnerOptions(opts),
            },
          }),
          testFiles
        )
      }

      if (opts.watch) {
        runner.watch()
      } else {
        runner.run()
      }
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  })
  .parse(process.argv)
