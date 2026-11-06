import type { BuildOptions } from 'esbuild'
import type {
  BrowserContextOptions,
  ChromiumBrowser,
  FirefoxBrowser,
  WebKitBrowser,
} from 'playwright-core'

export interface RunnerOptions {
  input?: string[]
  /**
   * The test runner, `--runner` wins over it. Autodetected from the test files
   * when neither is set.
   */
  runner?: 'mocha' | 'node-test' | 'none'
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
   * After tests hook, it only runs when `beforeTests` finished.
   *
   * It failing fails the run, and so does it not finishing in 60 seconds.
   *
   * @param env - Runner environment. Use `JSON.parse(env.PW_OPTIONS)` to access runner options.
   * @param beforeTestsOutput - What `beforeTests` returned.
   */
  afterTests: (env: RunnerEnv, beforeTestsOutput: unknown) => Promise<unknown>
}

export interface RunnerEnv extends NodeJS.ProcessEnv {
  PW_SERVER: string
  PW_OPTIONS: string
  NODE_ENV: 'test'
}

export interface CliOptions {
  runner: 'mocha' | 'none' | 'node-test'
  browser: 'chromium' | 'firefox' | 'webkit'
  mode: 'main' | 'worker' | 'node'
  debug: boolean
  incognito: boolean
  extension: boolean
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
 * `testRunner.options` configures whichever runner gets used.
 */
export type Config = Partial<Omit<RunnerOptions, 'testRunner'>> & {
  testRunner?: Pick<TestRunner, 'options'>
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

/**
 * One of the built-in runners: mocha, node-test or none.
 */
export interface TestRunner {
  name: NonNullable<RunnerOptions['runner']>
  /**
   * Module ID of the runner, also what auto detection looks for. `none` has no
   * module to look for.
   */
  moduleId?: string
  /**
   * Other module IDs that also tell a test file uses this runner.
   */
  aliases?: string[]
  /**
   * Options for the runner, from `testRunner.options` in the config file.
   */
  options?: unknown
  /**
   * Esbuild config for the runner (ignored in node mode)
   */
  buildConfig?: (options: RunnerOptions) => BuildOptions
  /**
   * Extra flags for the node process that runs the tests in node mode
   */
  nodeArgs?: (options: RunnerOptions) => string[]
  /**
   * Compile runtime entry point. In browser modes it is bundled with esbuild,
   * in node mode it is run as an ES module and `testPaths` are file URLs.
   */
  compileRuntime: (options: RunnerOptions, testPaths: string[]) => string
}
