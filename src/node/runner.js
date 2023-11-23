import { mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { asyncExitHook, gracefulExit } from 'exit-hook'
import mergeOptions from 'merge-options'
import { nanoid } from 'nanoid'
import { watch } from 'chokidar'
import { execa } from 'execa'
import { premove } from 'premove'
import { createPolka, findTests, log } from '../utils/index.js'
import * as DefaultRunners from '../test-runners.js'
import { build } from './utils.js'

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
    /** @type {import('polka').Polka["server"] | undefined} */
    this.server = undefined
    this.dir = path.join(__dirname, '../.tmp', nanoid())
    mkdirSync(this.dir, {
      recursive: true,
    })
    this.stopped = false
    this.watching = false
    /**
     * @type {import('../types.js').RunnerEnv}
     */
    this.env = merge(JSON.parse(JSON.stringify(process.env)), {
      PW_OPTIONS: JSON.stringify(this.options),
      NODE_ENV: 'test',
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

  async #setupServer() {
    // setup http server
    const { server, url } = await createPolka(
      this.dir,
      this.options.cwd,
      this.options.assets
    )
    this.env.PW_SERVER = url
    this.server = server
  }

  /**
   * Run the tests
   *
   */
  async runTests() {
    const { outName, files } = await build(
      this,
      this.options.testRunner.buildConfig
        ? this.options.testRunner.buildConfig(this.options)
        : {},
      this.options.testRunner.compileRuntime(
        this.options,
        this.tests.map((t) => t.replaceAll('\\', '/'))
      )
    )

    return { outName, files }
  }

  async run() {
    asyncExitHook(this.#clean.bind(this), {
      wait: 1000,
    })

    await this.#setupServer()
    await this.options.beforeTests(this.env)

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
    } catch {
      await this.stop(true, 'Tests failed.')
    }
    this.stop(false, 'Tests passed.')
  }

  async watch() {
    asyncExitHook(this.#clean.bind(this), {
      wait: 1000,
    })

    await this.#setupServer()
    await this.options.beforeTests(this.env)

    const { files, outName } = await this.runTests()
    try {
      await execa(
        'node',
        ['-r', 'source-map-support/register', path.join(this.dir, outName)],
        {
          stdio: 'inherit',
        }
      )
    } catch {}

    // Watch for changes
    const watcher = watch([...files], {
      ignored: /(^|[/\\])\../,
      ignoreInitial: true,
      awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 },
    }).on('change', async () => {
      try {
        log.info('Reloading tests...')
        const { files, outName } = await this.runTests()
        await execa(
          'node',
          ['-r', 'source-map-support/register', path.join(this.dir, outName)],
          {
            stdio: 'inherit',
          }
        )
        watcher.add([...files])
      } catch (/** @type {any} */ error) {
        if ('command' in error) {
          return
        }
        console.error(error.stack)
      }
    })
  }

  async #clean() {
    // Run after tests hook
    await this.options.afterTests(this.env)
    await premove(this.dir)
    const serverClose = new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            return reject(err)
          }
          resolve(true)
        })
      } else {
        resolve(true)
      }
    })

    await serverClose
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

    if (fail && msg) {
      log.error(msg)
    } else if (msg) {
      log.success(msg)
    }

    gracefulExit(fail ? 1 : 0)
  }
}
