# playwright-test [![NPM Version](https://img.shields.io/npm/v/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM Downloads](https://img.shields.io/npm/dt/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![NPM License](https://img.shields.io/npm/l/playwright-test.svg)](https://www.npmjs.com/package/playwright-test) [![Build Status](https://travis-ci.org/hugomrdias/playwright-test.svg?branch=master)](https://travis-ci.org/hugomrdias/playwright-test)

> Run mocha or tape unit tests with playwright.


## Install

```
$ npm install playwright-test
```


## Usage

```bash
 Usage
        $ playwright-test [input]
    Options
        --runner       Test runner. Options: mocha, tape. [Default: mocha]
        --watch, -w    Watch files for changes and re-run tests.
        --browser, -b  Browser to run tests. Options: chromium, firefox, webkit. [Default: chromium]
        --debug, -d    Debug mode, keeps browser window open.
        --mode, -m     Run mode. Options: main, worker. [Default: main]
        --incognito    Use incognito window to run tests.
        --extension    Use extension to run tests.
        --cwd          Current directory. [Default: '.']
        --extensions   Extensions to bundle. [Default: js,cjs,mjs]
    Examples
        $ playwright-test test.js --runner tape
        $ playwright-test test/**/*.spec.js --debug
        $ playwright-test test/**/*.spec.js --browser webkit -mode worker --incognito --debug
    Extra arguments
        All arguments passed to the cli not listed above will be fowarded to the runner.
        $ playwright-test test.js --runner mocha --bail --grep 'should fail'
```


## License

MIT © [Hugo Dias](http://hugodias.me)
