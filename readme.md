# playwright-test [![NPM Version](https://img.shields.io/npm/v/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM Downloads](https://img.shields.io/npm/dt/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM License](https://img.shields.io/npm/l/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) ![tests](https://github.com/hugomrdias/playwright-test/workflows/tests/badge.svg)

> Run mocha and `node:test` scripts inside real browsers with `playwright`.

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
    Run mocha and node:test scripts inside real browsers with `playwright` and in Node.

  Usage
    $ playwright-test [files] [options]

  Options
    -r, --runner           Test runner. Options: mocha, node-test and none, which only loads the files and is for scripts like benchmarks. Autodetected by default, see [auto detection](#runner-auto-detection).
    -b, --browser          Browser to run tests. Options: chromium, firefox, webkit.  (default chromium)
    -m, --mode             Run mode. Options: browser, web-worker, node and workerd.  (default browser)
    -d, --debug            Debug mode, keeps browser window open.  (default false)
    -w, --watch            Watch files for changes and re-run tests.
    --sw                   Path to a script to be loaded in a service worker.
    --assets               Folder with assets to be served by the http server.  (default process.cwd())
    --cwd                  Current directory.  (default process.cwd())
    --extensions           File extensions allowed in the bundle.  (default js,cjs,mjs,ts,tsx,jsx)
    --run-timeout          Fail the run after this many milliseconds, 0 turns it off. Not used with --debug or --watch.  (default 1800000)
    --test-name-pattern    Only run tests whose name matches this regular expression or /expression/flags. Repeat it to run tests matching any of them.
    --test-timeout         Timeout in milliseconds for tests without their own, 0 for none.
    --test-isolation       How test files are isolated: process runs each file on its own, none runs them together. Only --mode node supports process for now.  (default process)
    --test-concurrency     How many test files run at once with --test-isolation process.  (default os.availableParallelism() - 1)
    --trace                Save a Playwright trace to playwright-test-trace-<browser>.zip in --cwd, open it with `npx playwright show-trace`. Alone it only keeps the trace of a failed run, `--trace on` always keeps it. Values other than `off` fail with --mode node or workerd; ignored with --debug and --watch.  (default off)
    --config               Path to the config file
    -v, --version          Displays current version
    -h, --help             Displays this message


  Examples
    $ playwright-test test.js --runner mocha
    $ playwright-test test --debug
    $ playwright-test "test/**/*.spec.js" --browser webkit --mode web-worker --debug

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

`--mode node` runs your tests directly in Node.js without bundling or transforming anything. Test files are imported from their real paths in the project `cwd` and run exactly as plain Node runs them, so stack traces point at your source files.

```shell
playwright-test "test/**/*.spec.ts" --mode node
```

`buildConfig` doesn't apply in node mode. In node mode `--watch` re-runs the tests when any file matching `--extensions` changes in `cwd` (ignoring `node_modules` and dot folders). In browsers it watches the files that end up in the bundle, also the ones outside of `cwd` like in a monorepo, ignoring dot folders.

If you need more than plain Node supports, like full TypeScript, JSX or extensionless imports, preload [`@nubjs/runner`](https://nubjs.com/docs/standalone) through `NODE_OPTIONS`, which is passed to the Node process that runs the tests. Install it in your project first, then:

```shell
NODE_OPTIONS="--import @nubjs/runner" playwright-test "test/**/*.spec.ts" --mode node
```

## Workerd mode

`--mode workerd` runs your tests in [workerd](https://github.com/cloudflare/workerd), the Cloudflare Workers runtime, inside the worker of your [`cf` CLI](https://developers.cloudflare.com/cf/) config. It needs `cf` in your project, it brings Miniflare 5 along.

```shell
npm install -D cf
playwright-test "test/**/*.test.js" --mode workerd
```

The tests run inside the worker of `cloudflare.config.ts` in `cwd` (also `.mts`, `.js` and `.mjs`), with its bindings, exports, compatibility date and flags. `nodejs_compat` is always on, secrets come from the environment and every binding is local. The tests and the worker's entry point are bundled into one module with esbuild, so Durable Object classes exported from the entry point work with their bindings. `.txt`, `.html` and `.sql` imports are text, `.bin` is data and `.wasm` is a compiled module, like with `cf build`. A `.wasm?init` import is a function that instantiates the module, `await init(imports)` gives a `WebAssembly.Instance`. Tests reach the worker with `exports` and its bindings with `env`, both from `cloudflare:workers`:

```js
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { env, exports } from 'cloudflare:workers'

it('greets', async () => {
  const response = await exports.default.fetch('http://example.com/greet')
  assert.equal(await response.text(), 'hello world')
})

it('counts', async () => {
  assert.equal(await env.COUNTER.getByName('a').increment(), 1)
})
```

Without a config the tests run in an empty worker. The `workerd` key of the config file takes:

- `configPath`, the `cloudflare.config.ts` to use.
- `environment`, the mode `cloudflare.config.ts` functions get, like `cf dev --mode`, `test` by default.
- `main`, the worker entry point, instead of the config's `entrypoint`.
- `miniflare`, Miniflare 5 worker options merged over the ones from the config, for example `{ config: { env: { GREETING: { type: 'text', value: 'hi' } } } }`.

The http server of `--assets` runs as in the other modes, tests fetch its files from `process.env.PW_SERVER`.

`--sw`, `--trace` and `--watch` don't work in this mode, and neither do the static assets of `cloudflare.config.ts`, it doesn't say where their files are. A test that never settles fails the run, workerd cancels the request it runs in.

## `node:test` API

`playwright-test/node-test` is an implementation of the [`node:test`](https://nodejs.org/api/test.html) API, so the same test file runs in real browsers (`browser` and `web-worker` modes) and in Node.

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
playwright-test "test/**/*.test.js" --runner node-test --mode web-worker
playwright-test "test/**/*.test.js" --runner node-test --mode node
```

Files can import `node:test` instead, and they don't need to change to run anywhere:

- In browsers `node:test` resolves to `playwright-test/node-test`, and `node:assert` to [our own](#nodeassert-api).
- In node mode `node:test` is the real one, with all of its API and reporters, and everything under [what's different](#whats-different-from-nodetest) doesn't apply. A file that imports `playwright-test/node-test` keeps using that one with `--test-isolation none`, so it gets the same behaviour everywhere. With `--test-isolation process`, the default, it's the real `node:test` too, so APIs that your Node.js version doesn't have yet aren't there, like the `t.assert` helpers for mocks on Node.js 24.

`--test-name-pattern` and `--test-timeout` work the same with both. To use a `node:test` reporter in node mode set `testRunner.options.reporter` in the [config file](#runner-options), the output of `playwright-test/node-test` and of browsers is always the format of the `spec` reporter.

In node mode the process isn't forced to exit when the tests end, like `node:test`, so `--run-timeout` is what ends a run that something keeps alive.

The types are the ones from `node:test`, which come from `@types/node`.

### What's supported

- `test` (also the default export), `it`, `describe`, `suite`, `skip`, `todo`, `only`, `before`, `after`, `beforeEach`, `afterEach`, `mock`, `getTestContext`, and `assert.register`.
- `test(name?, options?, fn?)`, which returns a promise, and `.skip`, `.todo` and `.only` on all of them.
- The options `skip`, `todo`, `only`, `timeout`, `plan`, `signal`, `tags` and `concurrency`. There's no default timeout.
- Suites to any depth, async suites and hooks scoped to their suite. Everything runs in declaration order.
- The test context: `t.test`, `t.name`, `t.fullName`, `t.skip`, `t.todo`, `t.diagnostic`, `t.log`, `t.plan`, `t.assert` (with `called`, `callCount`, `lastCalledWith` and `nthCalledWith` in any Node.js version, in node mode only with `--test-isolation none`), `t.signal`, `t.mock`, `t.waitFor`, `t.runOnly`, `t.error`, `t.passed`, `t.tags`, `t.before`, `t.after`, `t.beforeEach`, `t.afterEach` and `(t, done)` callbacks, also in hooks.
- `mock.fn`, `mock.method`, `mock.getter`, `mock.setter`, `mock.property`, `mock.reset` and `mock.restoreAll`. `t.mock` is restored when the test ends.
- `mock.timers` with `enable`, `tick`, `runAll`, `setTime`, `reset` and `Symbol.dispose`. It mocks the globals `setTimeout`, `setInterval`, `setImmediate` (added when the browser has none), `Date` and `AbortSignal.timeout`. `t.mock.timers` is reset when the test ends.

`tests/node-test.test.ts` runs its fixtures with this API and with the real `node:test`, and compares execution order, per test results and exit codes.

### What throws

These aren't implemented and throw an error that names them, they never silently do nothing:

- `mock.module()`, and `scheduler.wait` in `mock.timers.enable({ apis })`, browsers have no `node:timers/promises`
- `t.assert.snapshot()`, `t.assert.fileSnapshot()` and `snapshot.setDefaultSnapshotSerializers()`, `snapshot.setResolveSnapshotPath()`
- `run()`
- `expectFailure()`, `test.expectFailure()` and the `expectFailure` option

### What's different from `node:test`

- Tests run serially, `concurrency` is accepted and ignored.
- `.only` always filters, there's no `--test-only` flag to pass.
- A test that never settles fails in node mode, where `node:test` hangs. A browser can't tell it will never settle and also waits forever, so use the `timeout` option.
- A throw in a root `after` hook fails the run, it exits with 0 in `node:test`.
- A root `after` hook runs when the whole run ends, `node:test` can run it earlier when using top level `await`.
- There's no async context in browsers, so a running test is what's used to find out where things belong. A global `test()` call while a test is running creates a subtest of that test, and an uncaught error fails the running test even when an earlier test caused it. Only one async `describe` body runs at a time, the others wait for it.
- In browsers, web workers and workerd all the files of a run share the root hooks, like `--test-isolation=none`.
- A top level `await test()` runs before anything else, so an `.only` declared later doesn't filter it. A test declared after the run ended throws.
- Awaiting `t.test()` on a test that already finished resolves and the subtest fails, it hangs in `node:test`.
- `t.assert` always counts for `t.plan()`, in `node:test` it doesn't if it was read before calling `t.plan()`.
- The output is always the format of the `spec` reporter of `node:test`, other reporters aren't supported. The list of failing tests has no `test at file:line:column` lines, the stack trace points at the test.
- A failed hook of a suite or a root hook counts in `ℹ fail`, in `node:test` it fails the run without counting.
- `t.filePath` and `t.workerId` are `undefined`.

### Migrating from `playwright-test/taps`

`playwright-test/taps` and `--runner taps` are gone, the API is the one from `node:test`:

| `playwright-test/taps`                        | `node:test`                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `test(name, fn, options)`                     | `test(name, options, fn)`. Options in the old position are **silently ignored**, a `{ skip: true }` test runs |
| `const s = suite('x'); s('a', fn)`            | `describe('x', () => { it('a', fn) })`                                                                        |
| `suite('x').skip`, `suite('x').only`          | `describe.skip('x', fn)`, `describe.only('x', fn)`                                                            |
| `s.before(fn)` and the other hooks of a suite | `before(fn)` inside of `describe`                                                                             |
| `import { assert } from ...`                  | `import assert from 'playwright-test/node-assert'`, or `node:assert/strict` in tests for node mode only       |
| `assert.type(x, 'string')`                    | `assert.equal(typeof x, 'string')`                                                                            |
| `assert.instance(x, Date)`                    | `assert.ok(x instanceof Date)`                                                                                |
| `assert.subset(a, b)`                         | `assert.partialDeepStrictEqual(a, b)`, it doesn't take compare functions                                      |
| A default timeout of 5 seconds                | No default timeout, use `--test-timeout`. Otherwise a test that hangs in a browser waits for `--run-timeout`  |
| `exec`, `hold` and `configure`                | Not available, tests start by themselves                                                                      |

Failures that used to pass are reported now: rejecting with nothing, uncaught errors in browsers, and tests declared inside of a test or after the run started.

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

It's a separate entrypoint because `node:test` has its own `assert` export, with `assert.register()`. The exports are the ones from `node:assert/strict`: `ok`, `equal`, `notEqual`, `deepEqual`, `notDeepEqual`, `strictEqual`, `notStrictEqual`, `deepStrictEqual`, `notDeepStrictEqual`, `partialDeepStrictEqual`, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail`, `AssertionError`, `Assert`, `CallTracker` and `strict`. The default export is `strict`, and `legacy` is the same thing with the shape of `node:assert`.

`tests/node-test.test.ts` runs the same cases in chromium and with the real `node:assert`, comparing the result, message, `name`, `code`, `operator`, `generatedMessage`, `diff` and own keys of each one. The only messages it allows to differ are the ones listed below and those with a stack trace, whose paths depend on the engine. CI also runs them in firefox and webkit.

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

This client package exposes the `playwright-test` options, some Playwright browser context methods and trusted input on the test page to be used in tests.

```ts
import * as Client from 'playwright-test/client'

it('should setoffline', async () => {
  if (Client.mode === 'browser') {
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
  if (Client.mode === 'browser') {
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

`context` has these methods of Playwright's [`BrowserContext`](https://playwright.dev/docs/api/class-browsercontext), with the same arguments and results:

- `setOffline`
- `grantPermissions`, `clearPermissions`
- `setGeolocation`
- `setExtraHTTPHeaders`
- `addCookies`, `cookies`, `clearCookies`

They also work with `--mode web-worker`, the worker asks the page to call them. In `node` and `workerd` modes `setOffline` does nothing and the others reject, there's no browser to set or read anything in.

### Trusted input

Code in the page can only dispatch events with `isTrusted` set to `false`, which don't count as user activation. `page` sends real input through Playwright instead, for what needs a user gesture, like the clipboard, fullscreen, popups or `navigator.userActivation`:

```js
import * as Client from 'playwright-test/client'

it('counts as user activation', async () => {
  const button = document.createElement('button')
  document.body.append(button)
  const clicked = new Promise((resolve) =>
    button.addEventListener('click', resolve)
  )

  await Client.page.click('button')

  equal((await clicked).isTrusted, true)
  equal(navigator.userActivation.isActive, true)
})
```

- `page.click(selector, options)`, Playwright's [`page.click`](https://playwright.dev/docs/api/class-page#page-click). It waits for the element to be visible and stable, up to the `timeout` option, 30 seconds by default. It takes the options of Playwright except `signal`, an `AbortSignal` can't be sent to the runner.
- `page.keyboard.press(key, options)` and `page.keyboard.type(text, options)`, Playwright's [`keyboard`](https://playwright.dev/docs/api/class-keyboard). They go to the focused element.

The input always goes to the test page. With `--mode web-worker` it still goes to the page that started the worker, so it can click what the page shows, but the worker can't see the events or get the user activation, workers have none. In `node` and `workerd` modes they reject.

Only these are there, not the rest of Playwright's `Page`, like `mouse`, `touchscreen`, `fill` or locators. Tests run in the page and can do most of it themselves, what they can't is trusted input.

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
| `none`                        | Warns and is ignored                 | Warns and is ignored               |

- `--test-name-pattern` is a regular expression, or `/expression/flags`. A test matches with its own name, the name of a suite it's in, or any of those joined by a space with the names above them. With `mocha` only the last one counts, so `^adds$` won't match a test inside a suite. Set it more than once, or to an array in the config file, to run the tests that match any of the patterns.
- `--test-timeout` is in milliseconds, `0` means no timeout. It's different from `--run-timeout`, which is for the whole run.

Both can also be set as `testNamePattern` and `testTimeout` in the config file.

### Test isolation

Like `node:test`, `--test-isolation process` runs each test file on its own, with its own globals and root hooks, and `--test-concurrency` sets how many files run at once. `--test-isolation none` runs all the files together in one place, where they share globals and root hooks, and `--test-concurrency` is ignored.

```shell
playwright-test "test/**" --runner node-test --mode node --test-concurrency 2
playwright-test "test/**" --test-isolation none
```

`process` is the default. For now only node mode supports it, browsers, web workers and workerd run the files together like `none`, and warn when `process` is set explicitly. Both can also be set as `testIsolation` and `testConcurrency` in the config file.

- `node-test` runs the files with `run()` of `node:test`, like `node --test --test-isolation=process`. `playwright-test/node-test` is the real `node:test` in them, so the output is the one of `node --test`.
- `mocha` and `none` run each file in a process of its own. With more than one at once, what a file prints waits until it ends, and the files come out in their order. After them a summary counts the files that passed, failed, were cancelled or didn't run, and names the ones that failed. Mocha's `bail`, on by default, ends the files still running when one fails and skips the rest.
- Each file is a run of its own for `mocha`: `.only` only filters the file it's in, and a reporter prints a report for each file, so `json` gives one document per file followed by the summary. `--test-isolation none` keeps one run for all the files.

### AI agents

When an AI agent drives the run, detected with [`std-env`](https://github.com/unjs/std-env), the `node:test` API (`node-test` with our API, not the real `node:test`) only prints what failed and its parent suites, plus the summary and the list of failures, to save the agent's context. Passing, skipped and todo tests aren't listed, but still count in the summary. What tests print themselves isn't filtered.

Our own output also has no colors in an agent unless `FORCE_COLOR` is set. Colors printed by tests aren't changed.

Nothing else is forwarded, an unknown flag is an error. Whatever else a runner takes goes in the config file, under `testRunner.options`. It applies to the runner in use, from `--runner`, `runner` in the config file or auto detection:

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

The runner comes from `--runner`, or `runner` in the config file:

```js
// playwright-test.config.js
export default {
  runner: 'mocha', // or 'node-test' or 'none'
}
```

Without either, every test file is read to find the runner:

- A file importing the module of a runner asks for it, through `import`, `require()` or `import()`. Only the exact module counts, `mocha/mocha.js` isn't `mocha`, and neither do type only imports.
- A top level call to `describe` or `it`, also `.only` and `.skip`, asks for `mocha`, unless the file declares or imports that name itself.
- When nothing asks for a runner it's `none`, with a warning.
- When files ask for different runners it's an error that names them.

## Flow control

All test runners support automatic flow control, which means you don't need to call special function or trigger any event in your tests to stop the run. The `none` runner does not support flow control.

To manually stop the run you can use `process.exit`:

```js
process.exit(0) // stops the run and exits with success
process.exit(1) // stops the run and exits with failure
```

In browsers an uncaught error or unhandled rejection in the page fails the run, even when the test runner reports all of its tests as passing. With the `none` runner they only get printed, it's up to your files to decide what fails the run.

A test can't navigate its page, that fails the run.

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

The `Config` type (the partial config type exported alongside `RunnerOptions`) can be imported from the entrypoint.

```ts
/** @type {import('playwright-test').Config} */
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
      minify: cliOptions.mode === 'web-worker',
    },
  }
}

export default buildConfig
```

### Browser launch and context options

`launchOptions` go to Playwright's [`launch`](https://playwright.dev/docs/api/class-browsertype#browser-type-launch) and `browserContextOptions` to the [browser context](https://playwright.dev/docs/api/class-browser#browser-new-context).

```js
export default {
  launchOptions: {
    // Google Chrome installed on the system instead of the downloaded Chromium
    channel: 'chrome',
    args: ['--disable-gpu'],
  },
  browserContextOptions: {
    locale: 'pt-PT',
  },
}
```

`args` come after the ones the runner needs, `headless` defaults to `!debug`, and `handleSIGINT` is always `false` because the runner handles interrupts. With `executablePath` or a `channel` other than `chromium` nothing gets downloaded, the browser has to be installed.

### Interface

Config files take `Config` (the partial config type, with optional `testRunner: { options }`) or `ConfigFn`, while programmatic runs resolve to `RunnerOptions`. See [src/types.ts](./src/types.ts) for the canonical type definitions, including `Config`, `ConfigFn`, `RunnerOptions`, `WorkerdOptions`, `buildConfig`/`buildSWConfig`, and the `beforeTests`/`afterTests` hooks.

## Run in CI

Check our CI config `.github/workflows/main.yml` and the playwright [Github Action](https://playwright.dev/docs/ci/#github-actions)

### Traces

`--debug` needs a display, so to see what happened in a run that failed in CI record a [Playwright trace](https://playwright.dev/docs/trace-viewer) with `--trace`. It has screenshots, DOM snapshots, console output and network requests of the run.

```shell
playwright-test test --trace     # keeps the trace when the run fails
playwright-test test --trace on  # always keeps it
```

The trace is saved as `playwright-test-trace-<browser>.zip` in `--cwd`, replacing the one of an earlier run, and the run prints where it went. Upload it as an artifact and open it with `npx playwright show-trace playwright-test-trace-chromium.zip` or at [trace.playwright.dev](https://trace.playwright.dev).

```yaml
- run: pnpm test --trace
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: trace
    path: playwright-test-trace-*.zip
```

Put the test files before `--trace`, `--trace test.js` would take the file as its value, or use `--trace=on`. In a config file it's `trace: 'on'` or `trace: 'retain-on-failure'`.

There's no trace in `node` or `workerd` mode; values other than `off` fail the run there (`--trace=off` still works to override a config file). It's ignored with `--debug`, closing the browser ends that run and takes the trace with it, and with `--watch`. When the browser crashes or gets killed there's nothing left to save, a crash of only the page still saves it.

## License

MIT © [Hugo Dias](http://hugodias.me)
