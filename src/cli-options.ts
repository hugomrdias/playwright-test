/** biome-ignore-all lint/suspicious/noConsole: its ok */

import fs from 'fs'
import { lilconfig } from 'lilconfig'
// @ts-expect-error
import mergeOptions from 'merge-options'
import path from 'path'
import sade from 'sade'
import { isAgent } from 'std-env'
import { fileURLToPath, pathToFileURL } from 'url'
import type { RunnerOptions } from './types.ts'
import { detectTestRunners } from './utils/auto-detect.ts'
import { colors } from './utils/colors.ts'
import {
  assertRunTimeout,
  defaultOptions,
  findTests,
  log,
  TRACE_VALUES,
  UsageError,
} from './utils/index.ts'
import { toRegExp } from './utils/name-pattern.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const merge = mergeOptions.bind({ ignoreUndefined: true })

const loadEsm = async (filepath: string) => {
  const res: { default?: unknown } = await import(
    pathToFileURL(filepath).toString()
  )
  if (res.default) {
    return res.default
  }

  return res
}

/**
 * Pick the test runner from what the test files use, or `none`.
 */
function autoDetectTestRunner(testFiles: string[]): RunnerOptions['runner'] {
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
  'browser',
  'config',
  'cwd',
  'd',
  'debug',
  'extensions',
  'm',
  'mode',
  'r',
  'run-timeout',
  'runner',
  'sw',
  'test-name-pattern',
  'test-timeout',
  'trace',
  'w',
  'watch',
])

/**
 * Nothing is forwarded to the runners, ignoring a flag would run the wrong tests.
 */
function checkUnknownFlags(opts: Record<string, unknown>) {
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

// Mocha treats 2 ** 31 - 1 as 0 (disables timeouts), so cap one below it.
const MAX_TEST_TIMEOUT = 2 ** 31 - 2

/**
 * Validate test-filtering and timeout options. Used both on explicit CLI flags
 * before invoking a config callback and on the merged options after.
 */
function validateTestOptions({
  testNamePattern,
  testTimeout,
  runTimeout,
}: {
  testNamePattern?: unknown
  testTimeout?: unknown
  runTimeout?: unknown
}) {
  // Like `node:test`, it can be set more than once to run what matches any of them
  for (const pattern of testNamePattern == null
    ? []
    : [testNamePattern].flat()) {
    if (typeof pattern !== 'string' || pattern === '') {
      throw new UsageError('--test-name-pattern requires a non-empty pattern.')
    }
    try {
      toRegExp(pattern)
    } catch (error) {
      throw new UsageError(
        `Invalid --test-name-pattern: ${(error as Error).message}`
      )
    }
  }
  if (
    testTimeout != null &&
    (!Number.isInteger(testTimeout) ||
      (testTimeout as number) < 0 ||
      (testTimeout as number) > MAX_TEST_TIMEOUT)
  ) {
    throw new UsageError(
      `--test-timeout must be a number of milliseconds (integer up to ${MAX_TEST_TIMEOUT}), 0 for none.`
    )
  }
  if (runTimeout != null) {
    assertRunTimeout(runTimeout)
  }
}

function validateOptions(options: RunnerOptions) {
  const { mode, trace } = options
  if (!['browser', 'web-worker', 'node', 'workerd'].includes(mode)) {
    throw new UsageError(
      `Invalid mode "${mode}", expected "browser", "web-worker", "node" or "workerd".`
    )
  }
  if (Array.isArray(trace) || !TRACE_VALUES.includes(trace)) {
    throw new UsageError(
      `Invalid --trace "${trace}", expected "on", "off" or "retain-on-failure". Put the test files before --trace, or use --trace=on.`
    )
  }
  if ((mode === 'node' || mode === 'workerd') && trace !== 'off') {
    throw new UsageError(
      `--trace records the browser, it does not work with --mode ${mode}.`
    )
  }
  validateTestOptions(options)
}

function warnUnsupportedTestOptions({
  runner,
  testNamePattern,
  testTimeout,
}: RunnerOptions) {
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
  extensions: defaultOptions.extensions,
  mode: defaultOptions.mode,
  trace: defaultOptions.trace,
}

/**
 * A new one each time, sade keeps state from parsing and printing the help.
 */
function program() {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  )
  // Here and not at the top, the colors are only set up once the cli starts
  const extra = `
  ${colors.bold('Examples')}
    ${colors.dim('$ playwright-test test.js --runner mocha')}
    ${colors.dim('$ playwright-test test --debug')}
    ${colors.dim(
      '$ playwright-test "test/**/*.spec.js" --browser webkit --mode web-worker --debug'
    )}

  ${colors.bold('Runner Options')}
    Everything else a runner takes goes in the config file, under \`testRunner.options\`.
    Check https://github.com/hugomrdias/playwright-test#runner-options

  ${colors.bold('Notes')}
    DEBUG env var filtering for 'debug' package logging will work as expected.
    ${colors.dim('$ DEBUG=app playwright-test test.js')}

    Do not let your shell expand globs, always wrap them.
    ${colors.dim('$ playwright-test "test/**"')} GOOD
    ${colors.dim('$ playwright-test test/**')} BAD

    A path that exists is used as is, even with glob characters in it.
    ${colors.dim('$ playwright-test "app/[id].test.js"')}

    It exits with 1 when no test files are found.
`

  const prog = sade('playwright-test [files]', true)
  const help = prog.help.bind(prog)
  prog.help = (cmd: string | undefined) => {
    help(cmd)
    console.log(extra)
  }

  return prog
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
      `Run mode. Options: browser, web-worker, node and workerd.  (default ${cliDefaults.mode})`
    )
    .option(
      '-d, --debug',
      `Debug mode, keeps browser window open.  (default ${cliDefaults.debug})`
    )
    .option('-w, --watch', 'Watch files for changes and re-run tests.')
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
      '--run-timeout',
      'Fail the run after this many milliseconds, 0 turns it off. Not used with --debug or --watch.  (default 1800000)'
    )
    .option(
      '--test-name-pattern',
      'Only run tests whose name matches this regular expression or /expression/flags. Repeat it to run tests matching any of them.'
    )
    .option(
      '--test-timeout',
      'Timeout in milliseconds for tests without their own, 0 for none.'
    )
    .option(
      '--trace',
      'Save a Playwright trace to playwright-test-trace-<browser>.zip in --cwd, open it with `npx playwright show-trace`. Alone it only keeps the trace of a failed run, `--trace on` always keeps it. Values other than `off` fail with --mode node or workerd; ignored with --debug and --watch.  (default off)'
    )
    .option('--config', 'Path to the config file')
}

async function loadConfig(file: string | undefined) {
  if (file) {
    return await lilconfig('playwright-test', {
      loaders: configLoaders,
    }).load(path.resolve(file))
  }
  return (
    (await lilconfig('playwright-test', {
      loaders: configLoaders,
    }).search()) ??
    (await lilconfig('pw-test', {
      loaders: configLoaders,
    }).search())
  )
}

/**
 * The flags as sade parses them, checked and merged with the config afterwards
 */
interface ParsedFlags {
  /** The files after the first one */
  _: string[]
  config?: string
  trace?: string
  [flag: string]: unknown
}

export interface ResolvedOptions {
  options: RunnerOptions
  testFiles: string[]
  watch: boolean
}

/**
 * Turn the arguments of the cli into the options of a run: parse the flags,
 * load the config file, merge them, find the test files and pick the runner.
 *
 * @param args - without node and the script
 * @returns nothing after --help or --version
 */
export async function resolveOptions(
  args: string[]
): Promise<ResolvedOptions | undefined> {
  const parsed = program().parse(['node', 'playwright-test', ...args], {
    lazy: true,
    // Without defaults to tell their types, `--debug test.js` would take the file
    boolean: ['debug', 'watch'],
    // `--trace` alone keeps only failed runs, so a value has to be a string
    string: [
      'browser',
      'cwd',
      'extensions',
      'mode',
      'test-name-pattern',
      'trace',
    ],
  })
  if (!parsed) {
    return
  }
  const [input, opts] = parsed.args as [string | undefined, ParsedFlags]

  checkUnknownFlags(opts)

  const config = await loadConfig(opts.config)

  const cliFlags = {
    runner: opts.runner,
    cwd: opts.cwd,
    assets: opts.assets,
    browser: opts.browser,
    debug: opts.debug,
    mode: opts.mode,
    sw: opts.sw,
    extensions: opts.extensions,
    runTimeout: opts['run-timeout'],
    testNamePattern: opts['test-name-pattern'],
    testTimeout: opts['test-timeout'],
  }
  validateTestOptions(cliFlags)

  // if the supplied config module was a function, invoke it
  if (config && typeof config.config === 'function') {
    config.config = await config.config(
      merge(cliDefaults, cliFlags, {
        watch: opts.watch,
        trace: opts.trace,
        config: opts.config,
      })
    )
  }

  /**
   * Merge cli options with config file options
   */
  const options: RunnerOptions = merge(
    cliDefaults,
    config ? config.config : {},
    {
      ...cliFlags,
      input: input ? [input, ...opts._] : undefined,
      testFiles: [],
      // Without a value it's an empty string
      trace: opts.trace === '' ? 'retain-on-failure' : opts.trace,
    }
  )
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

  return { options, testFiles, watch: Boolean(opts.watch) }
}
