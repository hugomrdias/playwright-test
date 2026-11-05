# playwright-test [![NPM Version](https://img.shields.io/npm/v/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM Downloads](https://img.shields.io/npm/dt/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM License](https://img.shields.io/npm/l/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) ![tests](https://github.com/hugomrdias/playwright-test/workflows/tests/badge.svg)

> Run mocha, uvu, tape and benchmark.js scripts inside real browsers with `playwright`.

## Install

```shell
pnpm install playwright-test
```

## Usage

```shell
playwright-test [files] [options]
# or
pw-test [files] [options]

```

## Options

```shell
Description
    Run mocha, uvu, tape and benchmark.js scripts inside real browsers with `playwright` and in Node.

  Usage
    $ playwright-test [files] [options]

  Options
    -r, --runner       Test runner. Options: mocha, tape, uvu, none, taps and benchmark. Internal runners are autodetected by default. It also accepts a path to a module or a module ID that exports a `playwrightTestRunner` object.
    -b, --browser      Browser to run tests. Options: chromium, firefox, webkit.  (default chromium)
    -m, --mode         Run mode. Options: main, worker and node.  (default main)
    -d, --debug        Debug mode, keeps browser window open.  (default false)
    -w, --watch        Watch files for changes and re-run tests.
    -i, --incognito    Use incognito window to run tests.  (default false)
    -e, --extension    Use extension background_page to run tests.  (default false)
    --cov              Enable code coverage in istanbul format. Outputs '.nyc_output/coverage-pw.json'.  (default false)
    --report-dir       Where to output code coverage in instanbul format.  (default .nyc_output)
    --before           Path to a script to be loaded on a separate tab before the main script.
    --sw               Path to a script to be loaded in a service worker.
    --assets           Folder with assets to be served by the http server.  (default process.cwd())
    --cwd              Current directory.  (default /Users/hd/code/playwright-test)
    --extensions       File extensions allowed in the bundle.  (default js,cjs,mjs,ts,tsx)
    --no-transform     Node mode only. Run files as plain Node would, without the built-in esbuild transform.
    --config           Path to the config file
    -v, --version      Displays current version
    -h, --help         Displays this message


  Examples
    $ playwright-test test.js --runner tape
    $ playwright-test test --debug
    $ playwright-test "test/**/*.spec.js" --browser webkit --mode worker --incognito --debug

    $ playwright-test bench.js --runner benchmark
    # Uses benchmark.js to run your benchmark see playwright-test/mocks/benchmark.js for an example.

    $ playwright-test test --cov && npx nyc report --reporter=html
    # Enable code coverage in istanbul format which can be used by nyc.

    $ playwright-test "test/**/*.spec.js" --debug --before ./mocks/before.js
    # Run a script in a separate tab. Check ./mocks/before.js for an example.
    # Important: You need to call `self.PW_TEST.beforeEnd()` to start the main script.

  Runner Options
    All arguments passed to the cli not listed above will be fowarded to the runner.
    $ playwright-test test.js --runner mocha --bail --grep 'should fail'

    To send a `false` flag use --no-bail.
    Check https://mochajs.org/api/mocha for `mocha` options or `npx mocha --help`.

  Notes
    DEBUG env var filtering for 'debug' package logging will work as expected.
    $ DEBUG:app playwright-test test.js

    Do not let your shell expand globs, always wrap them.
    $ playwright-test "test/**" GOOD
    $ playwright-test test/** BAD
```

## Node mode

`--mode node` runs your tests directly in Node.js without bundling. Test files are imported from their real paths in the project `cwd`, so stack traces and `--cov` point at your source files.

```shell
playwright-test "test/**/*.spec.ts" --mode node
```

Plain Node only understands [erasable TypeScript](https://nodejs.org/api/typescript.html#type-stripping) and strict ES module resolution, so a loader hook transforms project files one at a time with esbuild. Nothing under `node_modules` is transformed or re-resolved. The hook adds:

- Full TypeScript: `enum`, `namespace`, parameter properties and decorators.
- `.tsx` and `.jsx`, using the [automatic JSX runtime](https://esbuild.github.io/api/#jsx) by default.
- Extensionless relative imports (`./lib`), directory imports (`./lib` for `./lib/index.ts`) and `./lib.js` when the file is really `./lib.ts`.
- `import.meta.env`, which is the same object as `process.env`.

`--watch` re-runs the tests when any file matching `--extensions` changes in `cwd` (ignoring `node_modules` and dot folders).

### `buildConfig` in node mode

Each file is transformed on its own, so only these `buildConfig` keys apply. Everything else, including `plugins`, `inject`, `external` and `bundle`, is ignored, and so is the test runner `buildConfig`.

- `define`, which also applies to plain `.js` files that use one of its keys.
- `loader`, for loaders that output JavaScript (`js`, `jsx`, `ts`, `tsx`, `json`, `text`, `base64`, `dataurl` and `binary`). For example `{ '.txt': 'text' }`.
- `jsx`, `jsxDev`, `jsxFactory`, `jsxFragment`, `jsxImportSource` and `jsxSideEffects`.
- `tsconfigRaw`.

`tsconfig.json` is not read, so settings like `experimentalDecorators` have to go in `tsconfigRaw`, and `paths` is not supported. If you need `paths`, use your own loader as described below.

### Use your own loader

Turn the hook off with `--no-transform`, or `transform: false` in the config file, and the tests run as plain Node would. Do this when you preload another loader such as [tsx](https://tsx.is) or [`@nubjs/runner`](https://nubjs.com/docs/standalone) so files aren't transformed twice. `NODE_OPTIONS` is passed to the Node process that runs the tests. Install the loader in your project first, then:

```shell
NODE_OPTIONS="--import tsx" playwright-test "test/**/*.spec.ts" --mode node --no-transform
```

```shell
NODE_OPTIONS="--import @nubjs/runner" playwright-test "test/**/*.spec.ts" --mode node --no-transform
```

## `node:test` API

`playwright-test/taps/node-test` is an implementation of the [`node:test`](https://nodejs.org/api/test.html) API built on the `taps` harness, so the same test file runs in real browsers (main thread and worker modes) and in Node. It has no dependency on mocha, and `playwright-test/taps` keeps working as it did.

```js
import { strict as assert } from 'assert'
import {
  after,
  before,
  describe,
  it,
  mock,
  test,
} from 'playwright-test/taps/node-test'

describe('math', () => {
  before(() => console.log('setup'))
  after(() => console.log('teardown'))

  it('adds', () => {
    assert.equal(1 + 1, 2)
  })

  it('has subtests', async (t) => {
    await t.test('a subtest', () => {
      t.assert.ok(true)
    })
  })
})

test('mocks', { timeout: 1000 }, (t) => {
  const fn = t.mock.fn(() => 1)
  fn()
  assert.equal(fn.mock.callCount(), 1)
})
```

There's no built-in runner option for it yet, so pass a [custom test runner](#custom-test-runner) that drives it with `exec` and `hold`:

```js
// node-test-runner.js
export const playwrightTestRunner = {
  moduleId: 'playwright-test/taps/node-test',
  compileRuntime(_options, paths) {
    return `
const { exec, hold } = await import('playwright-test/taps/node-test')
hold()
${paths.map((url) => `await import('${url}')`).join('\n')}

exec().then(() => {
  process.exit(process.exitCode)
})
`
  },
}
```

```shell
playwright-test "test/**/*.test.js" --runner ./node-test-runner.js
playwright-test "test/**/*.test.js" --runner ./node-test-runner.js --mode worker
playwright-test "test/**/*.test.js" --runner ./node-test-runner.js --mode node
```

The types are the ones from `node:test`, which come from `@types/node`.

### What's supported

- `test` (also the default export), `it`, `describe`, `suite`, `before`, `after`, `beforeEach`, `afterEach`, `mock`, `getTestContext`, and `assert.register`.
- `test(name?, options?, fn?)`, which returns a promise, and `.skip`, `.todo` and `.only` on all of them.
- The options `skip`, `todo`, `only`, `timeout`, `plan`, `signal`, `tags` and `concurrency`. There's no default timeout.
- Suites to any depth, async suites and hooks scoped to their suite. Everything runs in declaration order.
- The test context: `t.test`, `t.name`, `t.fullName`, `t.skip`, `t.todo`, `t.diagnostic`, `t.log`, `t.plan`, `t.assert`, `t.signal`, `t.mock`, `t.waitFor`, `t.runOnly`, `t.error`, `t.passed`, `t.tags`, `t.before`, `t.after`, `t.beforeEach`, `t.afterEach` and `(t, done)` callbacks, also in hooks.
- `mock.fn`, `mock.method`, `mock.getter`, `mock.setter`, `mock.property`, `mock.reset` and `mock.restoreAll`. `t.mock` is restored when the test ends.

`test.js` runs its fixtures with this API and with the real `node:test`, and compares execution order, per test results and exit codes.

### What throws

These aren't implemented and throw an error that names them, they never silently do nothing:

- `mock.timers` and `mock.module()`
- `t.assert.snapshot()`, `t.assert.fileSnapshot()` and `snapshot.setDefaultSnapshotSerializers()`, `snapshot.setResolveSnapshotPath()`
- `run()`
- `test.expectFailure()` and the `expectFailure` option

### What's different from `node:test`

- Tests run serially, `concurrency` is accepted and ignored.
- `.only` always filters, there's no `--test-only` flag to pass.
- A test that never settles fails in node mode, where `node:test` hangs. A browser can't tell it will never settle and also waits forever, so use the `timeout` option.
- A throw in a root `after` hook fails the run, it exits with 0 in `node:test`.
- A root `after` hook runs when the whole run ends, `node:test` can run it earlier when using top level `await`.
- There's no async context in browsers, so a running test is what's used to find out where things belong. A global `test()` call while a test is running creates a subtest of that test, and an uncaught error fails the running test even when an earlier test caused it. Only one async `describe` body runs at a time, the others wait for it.
- All the files of a run share the root hooks, like `--test-isolation=none`.
- A top level `await test()` runs before anything else, so an `.only` declared later doesn't filter it. A test declared after the run ended throws.
- Awaiting `t.test()` on a test that already finished resolves and the subtest fails, it hangs in `node:test`.
- `t.assert` always counts for `t.plan()`, in `node:test` it doesn't if it was read before calling `t.plan()`.
- The output is the `taps` format, not a `node:test` reporter. `t.filePath` and `t.workerId` are `undefined`.

### With `playwright-test/taps` in the same file

They share the same `exec` and `hold`, reporting and exit code. A run has the default `test` suite of `playwright-test/taps` first, then all the `node:test` tests as one block, then the suites from `suite()` in the order they were created. `.only` in any of them filters out all the others. Root hooks only apply to `node:test` tests.

## `node:assert` API

`playwright-test/taps/node-assert` is `node:assert/strict` for tests that also run in browsers. In Node it's the built-in, in browsers it's an implementation ported from Node. `t.assert` of `playwright-test/taps/node-test` uses it too, with the loose `equal` and `deepEqual` that `t.assert` has in `node:test`.

```js
import assert, { deepEqual, throws } from 'playwright-test/taps/node-assert'
import test from 'playwright-test/taps/node-test'

test('compares', () => {
  deepEqual({ a: 1 }, { a: 1 })
  throws(() => assert.fail('nope'), { code: 'ERR_ASSERTION' })
})
```

It's a separate entrypoint because `node:test` has its own `assert` export, with `assert.register()`. The exports are the ones from `node:assert/strict`: `ok`, `equal`, `notEqual`, `deepEqual`, `notDeepEqual`, `strictEqual`, `notStrictEqual`, `deepStrictEqual`, `notDeepStrictEqual`, `partialDeepStrictEqual`, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail`, `AssertionError`, `Assert`, `CallTracker` and `strict`. The default export is `strict`, and `legacy` is the same thing with the shape of `node:assert`.

`test.js` runs the same cases in chromium and with the real `node:assert`, comparing the result, `name`, `code`, `operator` and `generatedMessage` of each one. CI also runs them in firefox and webkit.

In browsers:

- Error messages can be worded differently, and the `diff` option of `Assert` is ignored.
- `CallTracker` throws an error that says it isn't supported. It's deprecated in Node.
- Two different `CryptoKey`s are never deep equal, the key material isn't readable.
- `AssertionError` comes from the `assert` polyfill, so it isn't the same class as the one in Node.

## Client

This client package exposes the `playwright-test` options and some Playwright browser context methods to be used in tests.

```ts
import * as Client from 'playwright-test/client'

it('should setoffline', async () => {
  if (Client.mode === 'main' && Client.options.extension === false) {
    globalThis.addEventListener('offline', () => {
      console.log('offlineee')
    })
    await Client.context.setOffline(true)
    equal(navigator.onLine, false)
    await Client.context.setOffline(false)
    equal(navigator.onLine, true)
  }
})

it('should geolocation', async () => {
  if (Client.mode === 'main') {
    const deferred = pdefer()
    await Client.context.setGeolocation({
      latitude: 59.95,
      longitude: 30.316_67,
    })
    await Client.context.grantPermissions(['geolocation'])

    navigator.geolocation.getCurrentPosition((position) => {
      deferred.resolve(position)
    })

    const position = (await deferred.promise) as GeolocationPosition
    equal(position.coords.latitude, 59.95)
  }
})
```

## Flow control

All test runners support automatic flow control, which means you don't need to call special function or trigger any event in your tests to stop the run. The `none` runner does not support flow control.

To manually stop the run you can use `process.exit`:

```js
process.exit(0) // stops the run and exits with success
process.exit(1) // stops the run and exits with failure
```

## Custom test runner

You can define a custom test runner by passing a path to a file or a node module id that exports an object called `playwrightTestRunner` that implements the `TestRunner` interface.

```shell

$ playwright-test test.js --runner ./my-runner.js
# or
$ playwright-test test.js --runner my-runner

```

You can also just define you test runner in the config file.

```js
// playwright-test.config.js
/** @type {import('../src/runner.js').RunnerOptions} */
const config = {
  testRunner: {
    compileRuntime: (options, paths) => {
      return `
import 'mocha/mocha.js'

const mocha = globalThis.mocha
mocha.setup({
    reporter: 'spec',
    timeout: 5000,
    ui: 'bdd',
})

${paths.map((url) => `await import('${url}')`).join('\n')}

  mocha
    .run((f) =>{
      process.exit(f)
    })
        `
    },
  },
}

export default config
```

````ts
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
   * Esbuild config for the test runner (ignored in node mode)
   */
  buildConfig?: BuildOptions
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
````

## Config

> The config file needs to be commonjs for now, so if your package is pure ESM you need to use `.cjs` extension.

Configuration can be done with cli flags or config files.

```text
package.json, // using property `pw-test` or `playwright-test`
.playwright-testrc.json,
.playwright-testrc.js,
.playwright-testrc.cjs,
playwright-test.config.js,
playwright-test.config.cjs,
.pw-testrc.json,
.pw-testrc.js,
.pw-testrc.cjs,
pw-test.config.js,
pw-test.config.cjs,
.config/playwright-testrc.json
.config/playwright-testrc.js
.config/playwright-testrc.cjs
.config/pw-testrc.json
.config/pw-testrc.js
.config/pw-testrc.cjs
```

The config type can be imported from the entrypoint.

```ts
/** @type {import('playwright-test').RunnerOptions} */
const config = {
  // ...
}

export default config
```

The config file can also export a function that receives the cli options as argument.

```ts
/** @type {import('playwright-test').ConfigFn} */
function buildConfig(cliOptions) {
  return {
    buildConfig: {
      minify: cliOptions.mode === 'worker',
    },
  }
}

export default buildConfig
```

### Interface

```ts
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
  transform: boolean
  buildConfig: BuildOptions
  buildSWConfig: BuildOptions
  browserContextOptions?: BrowserContextOptions
  beforeTests: (opts: RunnerOptions) => Promise<unknown>
  afterTests: (
    opts: RunnerOptions,
    beforeTestsOutput: unknown
  ) => Promise<unknown>
}
```

## Run in CI

Check our CI config `.github/workflows/main.yml` and the playwright [Github Action](https://playwright.dev/docs/ci/#github-actions)

## License

MIT © [Hugo Dias](http://hugodias.me)
