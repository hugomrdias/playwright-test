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
  /**
   * Transform project files with esbuild in node mode (full TypeScript, JSX,
   * extensionless imports and `import.meta.env`). Turn it off to get plain Node
   * behaviour, for example when preloading another loader through `NODE_OPTIONS`.
   *
   * @default true
   */
  transform: boolean
  /**
   * Fail the run after this many milliseconds, a test can hang a run forever
   * otherwise. `0` turns it off. Ignored with `debug` and in watch mode.
   *
   * It's for the whole run, runners have their own per test options.
   *
   * @default 1800000
   */
  runTimeout: number
  /**
   * Only run tests whose name matches this regular expression, or
   * `/expression/flags`. Each test is matched by its own name, the name of its
   * ancestors and all of those names joined by a space.
   */
  testNamePattern?: string
  /**
   * Timeout in milliseconds for tests without their own, `0` for none.
   */
  testTimeout?: number
  /**
   * Esbuild config. In node mode only `define`, `loader`, the `jsx*` options and
   * `tsconfigRaw` apply.
   */
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
  runner: 'mocha' | 'none' | 'taps' | 'node-test'
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
  transform?: boolean
  testNamePattern?: string
  testTimeout?: number
  config?: string
}

/**
 * A `testRunner` with only `options` configures whichever runner gets used.
 */
export type Config = Partial<Omit<RunnerOptions, 'testRunner'>> & {
  testRunner?: Partial<TestRunner>
}

export type ConfigFn = (options: CliOptions) => Config

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
   * Other module IDs that also tell a test file uses this runner.
   */
  aliases?: string[]
  /**
   * The runner options it applies. The cli warns when any other is set.
   */
  supports?: Array<'testNamePattern' | 'testTimeout'>
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
   * Esbuild config for the test runner (ignored in node mode)
   */
  buildConfig?: (options: RunnerOptions) => BuildOptions
  /**
   * Extra flags for the node process that runs the tests in node mode
   */
  nodeArgs?: (options: RunnerOptions) => string[]
  /**
   * Compile runtime entry point. In browser modes it is bundled with esbuild,
   * in node mode it is run as an ES module and `testPaths` are file URLs.
   *
   * @param options - Runner options
   * @param testPaths - Test paths
   * @returns
   */
  compileRuntime: (options: RunnerOptions, testPaths: string[]) => string
}
