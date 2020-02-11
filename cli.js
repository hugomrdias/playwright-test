#!/usr/bin/env node
/* eslint-disable no-console */

'use strict';

const glob = require('glob');
const meow = require('meow');
const MochaRunner = require('./src/mocha-runner');

const cli = meow(`
    Usage
        $ puppetter-test [input]
    Options
        --browser    Browser to run tests. Options: chromium, firefox, webkit. [Default: chromium]
        --debug      Debug mode, keeps browser window open.
        --mode       Run mode. Options: main, worker. [Default: main]
        --incognito  Use incognito window to run tests.
        --extension  Use extension to run tests.
    Examples
        $ puppetter-test
        unicorns & rainbows
        $ puppetter-test ponies
        ponies & rainbows
`, {
    flags: {
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
        }
    }
});

console.log('TCL: cli', cli.flags);

const foundFiles = [];

for (const arg of cli.input) {
    for (const foundFile of glob.sync(arg, { absolute: true })) {
        foundFiles.push(foundFile);
    }
}

const runner = new MochaRunner({
    browser: cli.flags.browser,
    debug: cli.flags.debug,
    mode: cli.flags.mode,
    incognito: cli.flags.incognito,
    files: foundFiles,
    extension: cli.flags.extension
});

if (cli.flags.watch) {
    runner.watch();
} else {
    runner.run();
}

