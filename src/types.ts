import type { BuildOptions } from 'esbuild'
import type { BrowserContextOptions, LaunchOptions } from 'playwright-core'

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
  browser: 'chromium' | 'firefox' | 'webkit'
  debug: boolean
  mode: 'browser' | 'web-worker' | 'node' | 'workerd'
  extension: boolean
  assets: string
  sw?: string
  /**
   * Options for the workerd mode.
   */
  workerd?: WorkerdOptions
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
   * Record a Playwright trace of the run in browser modes, to open with
   * `npx playwright show-trace`. It's saved as
   * `playwright-test-trace-<browser>.zip` in `cwd`. `retain-on-failure` only
   * keeps it when the run fails, `on` always does. Ignored with `debug` and in
   * watch mode, not supported in node mode.
   *
   * @default 'off'
   */
  trace: 'off' | 'on' | 'retain-on-failure'
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
   * Set by the CLI when an AI agent drives the run. The `node:test` API then
   * only prints failures and the summary.
   */
  minimal?: boolean
  /**
   * Esbuild config. In node mode only `define`, `loader`, the `jsx*` options and
   * `tsconfigRaw` apply.
   */
  buildConfig: BuildOptions
  buildSWConfig: BuildOptions
  browserContextOptions?: BrowserContextOptions
  /**
   * Playwright launch options, for example `channel: 'chrome'` or
   * `executablePath` to use another browser, `args`, `proxy`, `slowMo` or
   * `firefoxUserPrefs`. `args` come after ours, and `headless` defaults to
   * `!debug`. `handleSIGINT` is always `false`, the runner handles interrupts.
   *
   * Nothing gets downloaded with `executablePath` or a channel other than
   * `chromium`, the browser has to be there.
   */
  launchOptions?: LaunchOptions
  /**
   * Before tests hook
   *
   * @param env - Runner environment. Use `JSON.parse(env.PW_OPTIONS)` to access runner options.
   */
  beforeTests: (env: RunnerEnv) => Promise<unknown>
  /**
   * After tests hook, it only runs when `beforeTests` finished. A run that ends
   * while `beforeTests` still runs waits up to 60 seconds for it.
   *
   * It failing fails the run, and so does it not finishing in 60 seconds.
   *
   * @param env - Runner environment. Use `JSON.parse(env.PW_OPTIONS)` to access runner options.
   * @param beforeTestsOutput - What `beforeTests` returned.
   */
  afterTests: (env: RunnerEnv, beforeTestsOutput: unknown) => Promise<unknown>
}

export interface WorkerdOptions {
  /**
   * Path to the `cloudflare.config.ts` of the `cf` CLI, by default the one in
   * `cwd` (also `.mts`, `.js` or `.mjs`). Its bindings, compatibility date and
   * flags and entry point configure the worker the tests run in.
   */
  configPath?: string
  /**
   * The mode `cloudflare.config.ts` functions get, like `cf dev --mode`,
   * `test` by default.
   */
  environment?: string
  /**
   * Entry point of the worker, instead of the config's `entrypoint`. Tests
   * reach its default export with `exports.default` from `cloudflare:workers`.
   */
  main?: string
  /**
   * Miniflare 5 worker options, merged over the ones from the config.
   *
   * @example
   * ```js
   * { config: { env: { GREETING: { type: 'text', value: 'hi' } } } }
   * ```
   */
  miniflare?: Record<string, unknown>
}

export interface RunnerEnv extends NodeJS.ProcessEnv {
  PW_SERVER: string
  PW_OPTIONS: string
  /** JSON of whether the runner's stdout and stderr are TTYs and their color depth. */
  PW_STDIO: string
  NODE_ENV: 'test'
}

export interface CliOptions {
  runner?: 'mocha' | 'none' | 'node-test'
  browser: 'chromium' | 'firefox' | 'webkit'
  mode: 'browser' | 'web-worker' | 'node' | 'workerd'
  debug: boolean
  extension: boolean
  watch?: boolean
  sw?: string
  assets?: string
  cwd: string
  extensions: string
  transform?: boolean
  runTimeout?: number
  /** `''` when the flag has no value */
  trace?: string
  testNamePattern?: string
  testTimeout?: number
  config?: string
}

/**
 * `testRunner.options` configures whichever runner gets used.
 */
export type Config = Partial<Omit<RunnerOptions, 'testRunner' | 'minimal'>> & {
  testRunner?: Pick<TestRunner, 'options'>
}

export type ConfigFn = (options: CliOptions) => Config

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
