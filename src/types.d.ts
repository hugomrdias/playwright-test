import type { BuildOptions } from 'esbuild'
import type {
  BrowserContextOptions,
  ChromiumBrowser,
  FirefoxBrowser,
  WebKitBrowser,
} from 'playwright-core'

export interface RunnerOptions {
  input?: string[]
  testRunner: TestRunner
  cwd: string
  extensions: string
  browser: 'chromium' | 'firefox' | 'webkit' | 'chromium-headless-shell'
  debug: boolean
  mode: 'main' | 'worker' | 'node'
  incognito: boolean
  extension: boolean
  assets: string
  before?: string
  sw?: string
  cov: boolean
  reportDir: string
  buildConfig: BuildOptions
  buildSWConfig: BuildOptions
  browserContextOptions?: BrowserContextOptions
  /**
   * Before tests hook
   *
   * @param env - Runner environment. Use `JSON.parse(env.PW_OPTIONS)` to access runner options.
   */
  beforeTests: (env: RunnerEnv) => Promise<unknown>
  /**
   * After tests hook
   *
   * @param env - Runner environment. Use `JSON.parse(env.PW_OPTIONS)` to access runner options.
   */
  afterTests: (env: RunnerEnv) => Promise<unknown>
}

export interface RunnerEnv extends NodeJS.ProcessEnv {
  PW_SERVER: string
  PW_OPTIONS: string
  NODE_ENV: 'test'
}

export interface CliOptions {
  runner: 'mocha' | 'zora' | 'tape' | 'uvu' | 'benchmark' | 'none'
  browser: 'chromium' | 'firefox' | 'webkit'
  mode: 'main' | 'worker' | 'node'
  debug: boolean
  incognito: boolean
  extension: boolean
  cov: boolean
  reportDir: string
  watch?: boolean
  before?: string
  sw?: string
  assets: string
  cwd: string
  extensions: string
  config?: string
}

export type ConfigFn = (options: CliOptions) => RunnerOptions

export type PwResult<TBrowser> = TBrowser extends 'webkit'
  ? WebKitBrowser
  : TBrowser extends 'firefox'
    ? FirefoxBrowser
    : TBrowser extends 'chromium'
      ? ChromiumBrowser
      : never

export interface CompilerOutput {
  outName: string
  files: Set<string>
}

export interface TestRunner {
  /**
   * Module ID name used to import the test runner runtime.
   * Used in auto detection of the test runner.
   */
  moduleId: string
  /**
   * Options made available to the compiled runtime.
   * This is useful to pass options to the test runner.
   *
   * @example
   * ```js
   * const options = JSON.parse(process.env.PW_OPTIONS)
   * const testRunnerOptions = options.testRunner.options
   * ```
   */
  options?: unknown
  /**
   * Esbuild config for the test runner
   */
  buildConfig?: (options: RunnerOptions) => BuildOptions
  /**
   * Compile runtime entry point for esbuild
   *
   * @param options - Runner options
   * @param testPaths - Test paths
   * @returns
   */
  compileRuntime: (options: RunnerOptions, testPaths: string[]) => string
}
