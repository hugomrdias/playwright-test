# playwright-test [![NPM Version](https://img.shields.io/npm/v/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM Downloads](https://img.shields.io/npm/dt/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM License](https://img.shields.io/npm/l/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) ![tests](https://github.com/hugomrdias/playwright-test/workflows/tests/badge.svg)

> Run mocha, zora, uvu, tape and benchmark.js scripts inside real browsers with `playwright`.

## Install

```shell
$ npm install playwright-test
```

## Usage

```shell
$ playwright-test [files] [options]
# or
$ pw-test [files] [options]

```

## Options

```shell
Description
    Run mocha, zora, uvu, tape and benchmark.js scripts inside real browsers with `playwright`.

  Usage
    $ playwright-test [files] [options]

  Options
    -r, --runner       Test runner. Options: mocha, tape, zora, uvu and benchmark.  (default mocha)
    -b, --browser      Browser to run tests. Options: chromium, firefox, webkit.  (default chromium)
    -m, --mode         Run mode. Options: main, worker.  (default main)
    -d, --debug        Debug mode, keeps browser window open.
    -w, --watch        Watch files for changes and re-run tests.
    -i, --incognito    Use incognito window to run tests.
    -e, --extension    Use extension background_page to run tests.
    --cov              Enable code coverage in istanbul format. Outputs '.nyc_output/coverage-pw.json'.
    --before           Path to a script to be loaded on a separate tab before the main script.
    --sw               Path to a script to be loaded in a service worker.
    --assets           Assets to be served by the http server.  (default process.cwd())
    --cwd              Current directory.  (default process.cwd())
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
    # Run a script in a separate tab check ./mocks/before.js for an example.
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

## Config

> The config file needs to be commonjs for now, so if your package is pure ESM you need to use `.cjs` extension.

Configuration can be done with cli flags or config files.

```js
'package.json', // using property `pw-test` or `playwright-test`
`.playwright-testrc.json`,
`.playwright-testrc.js`,
`playwright-test.config.js`,
`.playwright-testrc.cjs`,
`playwright-test.config.cjs`,
`.pw-testrc.json`,
`.pw-testrc.js`,
`pw-test.config.js`,
`.pw-testrc.cjs`,
`pw-test.config.cjs`,
```

The config type can be imported from the entrypoint.

```ts
import type { RunnerOptions } from 'playwright-test'
```

### Interface

```ts
export interface RunnerOptions {
  cwd: string
  assets: string
  browser: 'chromium' | 'firefox' | 'webkit'
  debug: boolean
  mode: 'main' | 'worker'
  incognito: boolean
  input?: string[]
  extension: boolean
  runnerOptions: any
  before?: string
  sw?: string
  cov: false
  extensions: string
  buildConfig: BuildOptions
  buildSWConfig: BuildOptions
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
