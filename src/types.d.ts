import type { BuildOptions } from 'esbuild'
import type {
  BrowserContextOptions,
  ChromiumBrowser,
  FirefoxBrowser,
  WebKitBrowser,
} from 'playwright-core'

export interface RunnerOptions<T> {
  cwd: string
  assets: string
  browser: 'chromium' | 'firefox' | 'webkit'
  debug: boolean
  mode: 'main' | 'worker'
  incognito: boolean
  input?: string[]
  extension: boolean
  runnerOptions: any
  testRunner: T
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

export interface TestRunner<O> {
  options?: O
  buildConfig?: BuildOptions
  compileRuntime: (options: RunnerOptions, testPaths: string[]) => string
}
