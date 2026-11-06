# playwright-test [![NPM Version](https://img.shields.io/npm/v/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM Downloads](https://img.shields.io/npm/dt/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM License](https://img.shields.io/npm/l/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) ![tests](https://github.com/hugomrdias/playwright-test/workflows/tests/badge.svg)

> Run mocha, `node:test` and taps scripts inside real browsers with `playwright`.

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
    Run mocha, node:test and taps scripts inside real browsers with `playwright` and in Node.

  Usage
    $ playwright-test [files] [options]

  Options
    -r, --runner       Test runner. Options: mocha, none, taps and node-test. Internal runners are autodetected by default, see [auto detection](#runner-auto-detection). It also accepts a path to a module or a module ID that exports a `playwrightTestRunner` object.
    -b, --browser      Browser to run tests. Options: chromium, firefox, webkit.  (default chromium)
    -m, --mode         Run mode. Options: main, worker and node.  (default main)
    -d, --debug        Debug mode, keeps browser window open.  (default false)
    -w, --watch        Watch files for changes and re-run tests.
    -i, --incognito    Use incognito window to run tests.  (default false)
    -e, --extension    Use extension background_page to run tests.  (default false)
    --before           Path to a script to be loaded on a separate tab before the main script.
    --sw               Path to a script to be loaded in a service worker.
    --assets           Folder with assets to be served by the http server.  (default process.cwd())
    --cwd              Current directory.  (default /Users/hd/code/playwright-test)
    --extensions       File extensions allowed in the bundle.  (default js,cjs,mjs,ts,tsx)
    --no-transform     Node mode only. Run files as plain Node would, without the built-in esbuild transform.
    --run-timeout      Fail the run after this many milliseconds, 0 turns it off. Not used with --debug or --watch.  (default 1800000)
    --config           Path to the config file
    -v, --version      Displays current version
    -h, --help         Displays this message


  Examples
    $ playwright-test test.js --runner mocha
    $ playwright-test test --debug
    $ playwright-test "test/**/*.spec.js" --browser webkit --mode worker --incognito --debug

    $ playwright-test "test/**/*.spec.js" --debug --before ./mocks/before.js
    # Run a script in a separate tab. Check ./mocks/before.js for an example.
    # Important: You need to call `self.PW_TEST.beforeEnd()` to start the main script.

  Runner Options
    Everything else a runner takes goes in the config file, under `testRunner.options`.
    Check https://github.com/hugomrdias/playwright-test#runner-options

  Notes
    DEBUG env var filtering for 'debug' package logging will work as expected.
    $ DEBUG=app playwright-test test.js

    Do not let your shell expand globs, always wrap them.
    $ playwright-test "test/**" GOOD
    $ playwright-test test/** BAD

    A path that exists is used as is, even with glob characters in it.
    $ playwright-test "app/[id].test.js"

    It exits with 1 when no test files are found.
```

## Node mode

`--mode node` runs your tests directly in Node.js without bundling. Test files are imported from their real paths in the project `cwd`, so stack traces point at your source files.

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

`playwright-test/node-test` is an implementation of the [`node:test`](https://nodejs.org/api/test.html) API built on the `taps` harness, so the same test file runs in real browsers (main thread and worker modes) and in Node.

```js
import { strict as assert } from 'assert'
import {
  after,
  before,
  describe,
  it,
  mock,
  test,
} from 'playwright-test/node-test'

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

Run it with the `node-test` runner, it's also autodetected from an import of `node:test` or `playwright-test/node-test`:

```shell
playwright-test "test/**/*.test.js" --runner node-test
playwright-test "test/**/*.test.js" --runner node-test --mode worker
playwright-test "test/**/*.test.js" --runner node-test --mode node
```

Files can import `node:test` instead, and they don't need to change to run anywhere:

- In browsers `node:test` resolves to `playwright-test/node-test`, and `node:assert` to [our own](#nodeassert-api).
- In node mode `node:test` is the real one, with all of its API and reporters, and everything under [what's different](#whats-different-from-nodetest) doesn't apply. A file that imports `playwright-test/node-test` keeps using that one, so it gets the same behaviour everywhere.

`--test-name-pattern` and `--test-timeout` work the same with both. To use a `node:test` reporter in node mode set `testRunner.options.reporter` in the [config file](#runner-options), the output of `playwright-test/node-test` and of browsers is always the `taps` format.

In node mode the process isn't forced to exit when the tests end, like `node:test`, so `--run-timeout` is what ends a run that something keeps alive.

The types are the ones from `node:test`, which come from `@types/node`.

### What's supported

- `test` (also the default export), `it`, `describe`, `suite`, `before`, `after`, `beforeEach`, `afterEach`, `mock`, `getTestContext`, and `assert.register`.
- `test(name?, options?, fn?)`, which returns a promise, and `.skip`, `.todo` and `.only` on all of them.
- The options `skip`, `todo`, `only`, `timeout`, `plan`, `signal`, `tags` and `concurrency`. There's no default timeout.
- Suites to any depth, async suites and hooks scoped to their suite. Everything runs in declaration order.
- The test context: `t.test`, `t.name`, `t.fullName`, `t.skip`, `t.todo`, `t.diagnostic`, `t.log`, `t.plan`, `t.assert`, `t.signal`, `t.mock`, `t.waitFor`, `t.runOnly`, `t.error`, `t.passed`, `t.tags`, `t.before`, `t.after`, `t.beforeEach`, `t.afterEach` and `(t, done)` callbacks, also in hooks.
- `mock.fn`, `mock.method`, `mock.getter`, `mock.setter`, `mock.property`, `mock.reset` and `mock.restoreAll`. `t.mock` is restored when the test ends.

`tests/node-test.test.js` runs its fixtures with this API and with the real `node:test`, and compares execution order, per test results and exit codes.

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

`playwright-test/node-assert` is `node:assert/strict` for tests that also run in browsers. In Node it's the built-in, in browsers it's an implementation ported from Node. `t.assert` of `playwright-test/node-test` uses it too, with the loose `equal` and `deepEqual` that `t.assert` has in `node:test`.

```js
import assert, { deepEqual, throws } from 'playwright-test/node-assert'
import test from 'playwright-test/node-test'

test('compares', () => {
  deepEqual({ a: 1 }, { a: 1 })
  throws(() => assert.fail('nope'), { code: 'ERR_ASSERTION' })
})
```

`playwright-test/taps` exports this same module, and adds `subset`, `type` and `instance` to it.

It's a separate entrypoint because `node:test` has its own `assert` export, with `assert.register()`. The exports are the ones from `node:assert/strict`: `ok`, `equal`, `notEqual`, `deepEqual`, `notDeepEqual`, `strictEqual`, `notStrictEqual`, `deepStrictEqual`, `notDeepStrictEqual`, `partialDeepStrictEqual`, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail`, `AssertionError`, `Assert`, `CallTracker` and `strict`. The default export is `strict`, and `legacy` is the same thing with the shape of `node:assert`.

`tests/node-test.test.js` runs the same cases in chromium and with the real `node:assert`, comparing the result, message, `name`, `code`, `operator`, `generatedMessage`, `diff` and own keys of each one. The only messages it allows to differ are the ones listed below and those with a stack trace, whose paths depend on the engine. CI also runs them in firefox and webkit.

In browsers:

- `CallTracker` throws an error that says it isn't supported. It's deprecated in Node.
- Two different `CryptoKey`s are never deep equal, the key material isn't readable.
- The `ok()` message can't show your source code, it always reads `assert.ok(value)`.
- A promise shows as `Promise { <unknown> }`, its state can't be read. The entries of map and set iterators can't be read either, and proxies look like the object they wrap.

## `node:util` API

`playwright-test/node-util` is `node:util` for code that also runs in browsers. In Node it's the built-in, in browsers it's [our own](#assert-and-util-in-browsers).

```js
import { inspect, promisify } from 'playwright-test/node-util'
```

The named exports are the ones both have and that aren't deprecated: `callbackify`, `debug`, `debuglog`, `deprecate`, `format`, `formatWithOptions`, `inherits`, `inspect`, `isDeepStrictEqual`, `promisify`, `stripVTControlCharacters`, `TextDecoder`, `TextEncoder`, `toUSVString` and `types`. The default export is the whole module, which has more in Node.

## `assert` and `util` in browsers

Bundles resolve `assert`, `assert/strict`, `util` and `util/types`, also with the `node:` prefix, to `src/polyfills`, there's no npm polyfill and anything installed with those names is ignored. `inspect`, `format`, `AssertionError` and its diff are the code from Node.js 24, in `src/vendor`. Since Node.js 26 `inspect` gives every part of a RegExp its own color, here it's all red.

`util` has `format`, `formatWithOptions`, `inspect`, `isDeepStrictEqual`, `promisify`, `callbackify`, `inherits`, `deprecate`, `debuglog`, `debug`, `log`, `stripVTControlCharacters`, `toUSVString`, `_extend`, `types`, `TextEncoder`, `TextDecoder` and the `isArray` style checks. Importing anything else by name fails when bundling. `isExternal`, `isKeyObject` and `isProxy` from `types` are always `false`, a browser can't tell.

## `process` in browsers

`process` is a global in browser bundles. Bundles also resolve `process`, `process/browser` and `process/browser.js`, also with the `node:` prefix, to the same object in `src/polyfills/process.js`. Anything installed with those names is ignored, and any other subpath of `process` fails when bundling.

- `stdout.write`, `stderr.write` and `exit` talk to the runner, and `env` has the environment of the run.
- `hrtime` uses `performance.now()`. `nextTick` runs its callbacks on a timer, after pending promise callbacks, unlike in Node.
- `cwd()` returns `/`, `umask()` returns `0`, `listeners()` returns `[]`, and `on`, `once`, `off`, `emit` and the other event methods do nothing. `chdir` and `binding` throw.
- `title`, `browser`, `argv`, `version` and `versions` are `browser`, `true`, `[]`, `''` and `{}`.

The default export is the whole object and these are also named exports, importing anything else by name fails when bundling. Other properties, like `process.platform`, are `undefined`.

## `path` in browsers

Bundles resolve `path` and `path/posix`, also with the `node:` prefix, to [`path-browserify`](https://github.com/browserify/path-browserify), including in service workers. Anything installed with those names is ignored.

It only has POSIX paths: `path.win32` is `null`, and `path/win32` and other subpaths fail when bundling. `path.matchesGlob` doesn't exist, and relative paths resolve from `/`, which is what `process.cwd()` returns in browsers.

## Stack traces

Browsers don't apply source maps to `Error.stack`, so the runner maps stack traces in everything the page prints: `console`, `process.stdout`, `process.stderr` and uncaught exceptions. This works the same in every browser and mode. Frames from the runner and its test runners are removed from the failures they report, here and in node mode.

Reading `error.stack` inside the page gives positions in the bundle.

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

## Runner options

Two options are ours and get mapped to whichever runner is used:

```shell
playwright-test test.js --test-name-pattern "suite a|^adds"
playwright-test test.js --test-timeout 10000
```

| Runner                        | `--test-name-pattern`                | `--test-timeout`                   |
| ----------------------------- | ------------------------------------ | ---------------------------------- |
| `mocha`                       | `grep`                               | `timeout`                          |
| `node-test` with the real one | `--test-name-pattern` of `node:test` | `--test-timeout` of `node:test`    |
| `node-test` with our API      | Filters the tests                    | Timeout of tests without their own |
| `taps`                        | Filters the tests                    | Timeout of tests without their own |
| `none`                        | Warns and is ignored                 | Warns and is ignored               |

- `--test-name-pattern` is a regular expression, or `/expression/flags`. A test matches with its own name, the name of a suite it's in, or any of those joined by a space with the names above them. With `mocha` only the last one counts, so `^adds$` won't match a test inside a suite.
- `--test-timeout` is in milliseconds, `0` means no timeout. It's different from `--run-timeout`, which is for the whole run.

Both can also be set as `testNamePattern` and `testTimeout` in the config file. A custom runner reads them from the options it gets, and lists them in `supports` so the cli doesn't warn.

Nothing else is forwarded, an unknown flag is an error. Whatever else a runner takes goes in the config file, under `testRunner.options`. It applies to the runner in use, from `--runner` or auto detection:

```js
// playwright-test.config.js
export default {
  testRunner: {
    options: {
      bail: false, // mocha
      ui: 'tdd', // mocha
      reporter: 'tap', // the real node:test in node mode
    },
  },
}
```

## Runner auto detection

Without `--runner` or a `testRunner` in the config file, every test file is read to find the runner:

- A file importing the module of a runner asks for it, through `import`, `require()` or `import()`. Only the exact module counts, `mocha/mocha.js` isn't `mocha`, and neither do type only imports.
- A top level call to `describe` or `it`, also `.only` and `.skip`, asks for `mocha`, unless the file declares or imports that name itself.
- When nothing asks for a runner it's `none`, with a warning.
- When files ask for different runners it's an error that names them. `node-test` and `taps` can be used together, the `node-test` runner runs both.

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

Configuration can be done with cli flags or config files, flags win over the config file.

```text
package.json, // using property `pw-test` or `playwright-test`
.playwright-testrc.json,
.playwright-testrc.js,
.playwright-testrc.cjs,
.playwright-testrc.mjs,
playwright-test.config.js,
playwright-test.config.cjs,
playwright-test.config.mjs,
.pw-testrc.json,
.pw-testrc.js,
.pw-testrc.cjs,
.pw-testrc.mjs,
pw-test.config.js,
pw-test.config.cjs,
pw-test.config.mjs,
.config/playwright-testrc.json
.config/playwright-testrc.js
.config/playwright-testrc.cjs
.config/playwright-testrc.mjs
.config/pw-testrc.json
.config/pw-testrc.js
.config/pw-testrc.cjs
.config/pw-testrc.mjs
```

Config files follow the module rules of Node.js: `.mjs` uses `export default`, `.cjs` uses `module.exports`, and `.js` depends on the `type` in your `package.json`.

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
