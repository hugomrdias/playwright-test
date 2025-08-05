# playwright-test [![NPM Version](https://img.shields.io/npm/v/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM Downloads](https://img.shields.io/npm/dt/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM License](https://img.shields.io/npm/l/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) ![tests](https://github.com/hugomrdias/playwright-test/workflows/tests/badge.svg)

> Run mocha, zora, uvu, tape and benchmark.js scripts inside real browsers with `playwright`.

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
    Run mocha, zora, uvu, tape and benchmark.js scripts inside real browsers with `playwright` and in Node.

  Usage
    $ playwright-test [files] [options]

  Options
    -r, --runner       Test runner. Options: mocha, tape, zora, uvu, none, taps and benchmark. Internal runners are autodetected by default. It also accepts a path to a module or a module ID that exports a `playwrightTestRunner` object.
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
import mocha from 'mocha/mocha.js'
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
      bundle: cliOptions.mode !== 'node',
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
