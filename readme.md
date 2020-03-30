# playwright-test [![NPM Version](https://img.shields.io/npm/v/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM Downloads](https://img.shields.io/npm/dt/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM License](https://img.shields.io/npm/l/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) ![tests](https://github.com/hugomrdias/playwright-test/workflows/tests/badge.svg)

> Run mocha, zora, tape and benchmark.js scripts inside real browsers with `playwright`.


## Install

```
$ npm install playwright-test
```


## Usage

```console
$ playwright-test [input]

Options
    --runner       Test runner. Options: mocha, tape, benchmark and zora. [Default: mocha]
    --watch, -w    Watch files for changes and re-run tests.
    --browser, -b  Browser to run tests. Options: chromium, firefox, webkit. [Default: chromium]
    --debug, -d    Debug mode, keeps browser window open.
    --mode, -m     Run mode. Options: main, worker. [Default: main]
    --incognito    Use incognito window to run tests.
    --extension    Use extension background_page to run tests.
    --before       Full path to a script to be executed before, on a separate tab.
    --assets       Assets to be served by the http server. [Default: process.cwd()]
    --cwd          Current directory. [Default: process.cwd()]
    --extensions   File extensions allowed in the bundle. [Default: js,cjs,mjs]
    
Examples
    $ playwright-test test.js --runner tape
    $ playwright-test test/**/*.spec.js --debug
    $ playwright-test test/**/*.spec.js --browser webkit --mode worker --incognito --debug

    $ playwright-text benchmark.js --runner benchmark
    # Use benchmark.js to run your benchmark see playwright-test/mocks/benchmark.js for an example.

    $ playwright-test test/**/*.spec.js --debug --before ./mocks/before.js
    # Run before.js in a separate tab check ./mocks/before.js for an example. Important: You need to call \`self.pwTestController.beforeEnd()\`, if you want the main tab to wait for the before script.

Extra arguments
    All arguments passed to the cli not listed above will be fowarded to the runner.
    To send a `false` flag use --no-bail.
    $ playwright-test test.js --runner mocha --bail --grep 'should fail'

    Check https://mochajs.org/api/mocha for `mocha` options or `npx mocha --help`.

Notes
    DEBUG environmental variable is properly redirected to the browser. If you use 'debug' package for logs the following example will work as you expect. 
    $ DEBUG:app playwright-test test.js 
```


## License

MIT © [Hugo Dias](http://hugodias.me)
