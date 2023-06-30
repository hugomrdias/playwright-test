/* eslint-disable no-console */

import { mkdirSync } from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'
import { findTests } from '../utils/index.js'
import mergeOptions from 'merge-options'
import { fileURLToPath } from 'node:url'
import { watch } from 'chokidar'
import { build } from './utils.js'
import { execa } from 'execa'
import * as DefaultRunners from '../test-runners.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const merge = mergeOptions.bind({ ignoreUndefined: true })

/**
 * @typedef {import('playwright-core').Page} Page
 * @typedef {import('playwright-core').BrowserContext} Context
 * @typedef {import('playwright-core').Browser} Browser
 * @typedef {import('playwright-core').ChromiumBrowserContext} ChromiumBrowserContext
 * @typedef {import('../types.js').RunnerOptions} RunnerOptions
 * @typedef {import('../types.js').TestRunner} TestRunner
 */

/**
 * @type {import('../types.js').RunnerOptions}
 */
const defaultOptions = {
  cwd: process.cwd(),
  assets: '',
  browser: 'chromium',
  debug: false,
  mode: 'main', // worker
  incognito: false,
  input: undefined,
  extension: false,
  testRunner: DefaultRunners.none,
  before: undefined,
  sw: undefined,
  cov: false,
  reportDir: '.nyc_output',
  extensions: 'js,cjs,mjs,ts,tsx',
  buildConfig: {},
  buildSWConfig: {},
  browserContextOptions: {},
  beforeTests: async () => {},
  afterTests: async () => {},
}

export class NodeRunner {
  /**
   *
   * @param {Partial<import('../types.js').RunnerOptions>} options
   * @param {string[]} [testFiles]
   */
  constructor(options = {}, testFiles) {
    /** @type {import('../types.js').RunnerOptions} */
    this.options = merge(defaultOptions, options)
    this.dir = path.join(__dirname, '../.tmp', nanoid())
    mkdirSync(this.dir, {
      recursive: true,
    })
    this.stopped = false
    this.watching = false
    this.beforeTestsOutput = undefined
    this.env = merge(JSON.parse(JSON.stringify(process.env)), {
      PW_TEST: this.options,
    })
    this.tests =
      testFiles ??
      findTests({
        cwd: this.options.cwd,
        extensions: this.options.extensions.split(','),
        filePatterns: options.input ?? [],
      })

    if (this.tests.length === 0) {
      this.stop(false, 'No test files were found.')
    }
  }

  /**
   * Run the tests
   *
   */
  async runTests() {
    const files = []
    const { outName, files: mainFiles } = await build(
      this,
      this.options.testRunner.buildConfig
        ? this.options.testRunner.buildConfig(this.options)
        : {},
      this.options.testRunner.compileRuntime(
        this.options,
        this.tests.map((t) => t.replaceAll('\\', '/'))
      )
    )
    files.push(...mainFiles)

    return { outName, files }
  }

  async run() {
    this.beforeTestsOutput = await this.options.beforeTests(this.options)

    try {
      const { outName } = await this.runTests()
      await (this.options.cov
        ? execa(
            'c8',
            [
              '--reporter=text',
              '--reporter=json',
              '--report-dir',
              this.options.reportDir,
              '--exclude-after-remap',
              '--src',
              this.dir,
              'node',
              '-r',
              'source-map-support/register',
              path.join(this.dir, outName),
            ],
            {
              preferLocal: true,
              stdio: 'inherit',
            }
          )
        : execa(
            'node',
            ['-r', 'source-map-support/register', path.join(this.dir, outName)],
            {
              preferLocal: true,
              stdio: 'inherit',
            }
          ))
    } catch (/** @type {any} */ error) {
      await this.stop(true, error)
    }
  }

  async watch() {
    const { files, outName } = await this.runTests()
    await execa(
      'node',
      ['-r', 'source-map-support/register', path.join(this.dir, outName)],
      {
        stdio: 'inherit',
      }
    )

    const watcher = watch([...files], {
      ignored: /(^|[/\\])\../,
      ignoreInitial: true,
      awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 },
    }).on('change', async () => {
      const { files, outName } = await this.runTests()
      await execa(
        'node',
        ['-r', 'source-map-support/register', path.join(this.dir, outName)],
        {
          stdio: 'inherit',
        }
      )
      watcher.add([...files])
    })
  }

  /**
   * @param {boolean} fail
   * @param {string | undefined} [msg]
   */
  async stop(fail, msg) {
    if (this.stopped || this.options.debug) {
      return
    }
    this.stopped = true

    // Run after tests hook
    await this.options.afterTests(this.options, this.beforeTestsOutput)

    if (fail && msg) {
      // console.error(msg)
    } else if (msg) {
      // console.log(msg)
    }

    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(fail ? 1 : 0)
  }
}
