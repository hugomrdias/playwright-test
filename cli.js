#!/usr/bin/env node
/* eslint-disable no-console */

'use strict';

const meow = require('meow');
const camelCase = require('camelcase');
const { findTests, defaultTestPatterns } = require('./src/utils');
const MochaRunner = require('./src/runner-mocha');
const TapeRunner = require('./src/runner-tape');
const BenchmarkRunner = require('./src/runner-benchmark');

const cli = meow(`
Usage
    $ playwright-test [input]

    Options
        --runner       Test runner. Options: mocha, tape, benchmark. [Default: mocha]
        --watch, -w    Watch files for changes and re-run tests.
        --browser, -b  Browser to run tests. Options: chromium, firefox, webkit. [Default: chromium]
        --debug, -d    Debug mode, keeps browser window open.
        --mode, -m     Run mode. Options: main, worker. [Default: main]
        --incognito    Use incognito window to run tests.
        --extension    Use extension background_page to run tests.
        --before       Full path to a script to be loaded on a separate tab.
        --assets       Assets to be served by the http server. [Default: process.cwd()]
        --cwd          Current directory. [Default: process.cwd()]
        --extensions   File extensions allowed in the bundle. [Default: js,cjs,mjs]
    Examples
        $ playwright-test test.js --runner tape
        $ playwright-test test/**/*.spec.js --debug
        $ playwright-test test/**/*.spec.js --browser webkit -mode worker --incognito --debug

        $ playwright-text benchmark.js --runner benchmark
        # Use benchmark.js to run your benchmark see playwright-test/mocks/benchmark.js for an example.

        $ playwright-test test/**/*.spec.js --debug --before ./mocks/before.js
        # Run before.js in a separate tab check ./mocks/before.js for an example. Important: You need to call \`self.pwTestController.beforeEnd()\`, if you want the main tab to wait for the before script.

    Extra arguments
        All arguments passed to the cli not listed above will be fowarded to the runner.
        To send a \`false\` flag use --no-bail.
        $ playwright-test test.js --runner mocha --bail --grep 'should fail'

        Check https://mochajs.org/api/mocha for \`mocha\` options or \`npx mocha --help\`.

    Notes
        DEBUG environmental variable is properly redirected to the browser. If you use 'debug' package for logging the following example will work as you expect.
        $ DEBUG:app playwright-test test.js
`, {
    flags: {
        runner: {
            type: 'string',
            default: 'mocha'
        },
        watch: {
            type: 'boolean',
            default: false,
            alias: 'w'
        },
        browser: {
            type: 'string',
            default: 'chromium',
            alias: 'b'
        },
        debug: {
            type: 'boolean',
            default: false,
            alias: 'd'
        },
        mode: {
            type: 'string',
            default: 'main',
            alias: 'm'
        },
        incognito: {
            type: 'boolean',
            default: false
        },
        extension: {
            type: 'boolean',
            default: false
        },
        cwd: {
            type: 'string',
            default: process.cwd()
        },
        extensions: {
            type: 'array',
            default: ['js', 'cjs', 'mjs']
        },
        assets: {
            type: 'string',
            default: ''
        },
        before: {
            type: 'string',
            default: ''
        }
    }
});

// console.log('TCL: cli', cli.flags, cli.input);

const files = findTests({
    cwd: cli.flags.cwd,
    extensions: cli.flags.extensions,
    filePatterns: cli.input.length === 0 ? defaultTestPatterns(cli.flags.extensions) : cli.input
});

const runnerOptions = () => {
    const opts = {};

    // eslint-disable-next-line guard-for-in
    for (const key in cli.flags) {
        const value = cli.flags[key];
        const localFlags = [
            'browser',
            'runner',
            'watch',
            'debug',
            'mode',
            'incognito',
            'extension',
            'cwd',
            'extensions',
            'assets',
            'before'
        ];

        if (!localFlags.includes(key)) {
            opts[camelCase(key)] = value;
        }
    }

    return opts;
};

if (files.length === 0) {
    console.log('No test files were found.');
    process.exit(0);
}

let Runner = null;

if (cli.flags.runner === 'benchmark') {
    Runner = BenchmarkRunner;
}
if (cli.flags.runner === 'mocha') {
    Runner = MochaRunner;
}
if (cli.flags.runner === 'tape') {
    Runner = TapeRunner;
}
const runner = new Runner({
    cwd: cli.flags.cwd,
    assets: cli.flags.assets,
    browser: cli.flags.browser,
    debug: cli.flags.debug,
    mode: cli.flags.mode,
    incognito: cli.flags.incognito,
    files,
    extension: cli.flags.extension,
    runnerOptions: runnerOptions(),
    before: cli.flags.before
});

if (cli.flags.watch) {
    runner.watch();
} else {
    runner.run();
}

