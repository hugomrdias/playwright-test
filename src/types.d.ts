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
  browser: 'chromium' | 'firefox' | 'webkit'
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
  beforeTests: (opts: RunnerOptions) => Promise<unknown>
  afterTests: (
    opts: RunnerOptions,
    beforeTestsOutput: unknown
  ) => Promise<unknown>
}

export interface RunnerEnv extends NodeJS.ProcessEnv {
  PW_SERVER: string
  PW_TEST: RunnerOptions
  NODE_ENV: 'test'
}

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
   * Options made available to the compiled runtime, accessable with `process.env.PW_TEST.testRunner.options`.
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
