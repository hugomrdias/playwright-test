import type { BuildOptions } from 'esbuild'
import type {
  BrowserContextOptions,
  ChromiumBrowser,
  FirefoxBrowser,
  WebKitBrowser,
} from 'playwright-core'

export interface RunnerOptions {
  cwd: string
  assets: string
  browser: 'chromium' | 'firefox' | 'webkit'
  debug: boolean
  mode: 'main' | 'worker'
  incognito: boolean
  input?: string[]
  extension: boolean
  testRunner: TestRunner
  before?: string
  sw?: string
  cov: false
  reportDir: string
  extensions: string
  buildConfig: BuildOptions
  buildSWConfig: BuildOptions
  browserContextOptions?: BrowserContextOptions
  beforeTests: (opts: RunnerOptions) => Promise<unknown>
  afterTests: (
    opts: RunnerOptions,
    beforeTestsOutput: unknown
  ) => Promise<unknown>
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
  options?: unknown
  /**
   * Esbuild config for the test runner
   */
  buildConfig?: BuildOptions
  /**
   * Compile runtime entry point for esbuild
   *
   * @param options - Runner options
   * @param testPaths - Test paths
   * @returns
   */
  compileRuntime: (options: RunnerOptions, testPaths: string[]) => string
}
