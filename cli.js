#!/usr/bin/env node
/* eslint-disable no-console */

'use strict';

const path = require('path');
const sade = require('sade');
const kleur = require('kleur');
const lilconfig = require('lilconfig');
const merge = require('merge-options').bind({ ignoreUndefined: true });
const pkg = require('./package.json');
const { runnerOptions } = require('./src/utils');
const UvuRunner = require('./src/runner-uvu');
const MochaRunner = require('./src/runner-mocha');
const TapeRunner = require('./src/runner-tape');
const BenchmarkRunner = require('./src/runner-benchmark');
const ZoraRunner = require('./src/runner-zora');

// Handle any uncaught errors
process.once('uncaughtException', (err, origin) => {
    if (!origin || origin === 'uncaughtException') {
        console.error(err);
        process.exit(1);
    }
});
process.once('unhandledRejection', (err) => {
    console.error(err);
    process.exit(1);
});

const extra = `
  ${kleur.bold('Examples')}
    ${kleur.dim('$ playwright-test test.js --runner tape')}
    ${kleur.dim('$ playwright-test test --debug')}
    ${kleur.dim('$ playwright-test "test/**/*.spec.js" --browser webkit --mode worker --incognito --debug')}

    ${kleur.dim('$ playwright-test bench.js --runner benchmark')}
    ${kleur.gray('# Uses benchmark.js to run your benchmark see playwright-test/mocks/benchmark.js for an example.')}

    ${kleur.dim('$ playwright-test test --cov && npx nyc report --reporter=html')}
    ${kleur.gray('# Enable code coverage in istanbul format which can be used by nyc.')}

    ${kleur.dim('$ playwright-test "test/**/*.spec.js" --debug --before ./mocks/before.js')}
    ${kleur.gray('# Run a script in a separate tab check ./mocks/before.js for an example.\n    # Important: You need to call `self.PW_TEST.beforeEnd()` to start the main script.')}

  ${kleur.bold('Runner Options')}
    All arguments passed to the cli not listed above will be fowarded to the runner.
    ${kleur.dim('$ playwright-test test.js --runner mocha --bail --grep \'should fail\'')}

    To send a \`false\` flag use --no-bail.
    Check https://mochajs.org/api/mocha for \`mocha\` options or \`npx mocha --help\`.

  ${kleur.bold('Notes')}
    DEBUG env var filtering for 'debug' package logging will work as expected.
    ${kleur.dim('$ DEBUG:app playwright-test test.js')}

    Do not let your shell expand globs, always wrap them.
    ${kleur.dim('$ playwright-test "test/**"')} GOOD
    ${kleur.dim('$ playwright-test test/**')} BAD
`;

const sade2 = new Proxy(sade('playwright-test [files]', true), {
    get: (target, prop, receiver) => {
        const targetValue = Reflect.get(target, prop, receiver);

        if (typeof targetValue === 'function') {
            return function(...args) {
                const out = targetValue.apply(this, args);

                if (prop === 'help') {
                    console.log(extra);
                }

                return out;
            };
        }

        return targetValue;
    }
});

sade2
    .version(pkg.version)
    .describe('Run mocha, zora, uvu, tape and benchmark.js scripts inside real browsers with `playwright`.')
    .option('-r, --runner', 'Test runner. Options: mocha, tape, benchmark and zora.', 'mocha')
    .option('-b, --browser', 'Browser to run tests. Options: chromium, firefox, webkit.  (default chromium)')
    .option('-m, --mode', 'Run mode. Options: main, worker.  (default main)')
    .option('-d, --debug', 'Debug mode, keeps browser window open.')
    .option('-w, --watch', 'Watch files for changes and re-run tests.')
    .option('-i, --incognito', 'Use incognito window to run tests.')
    .option('-e, --extension', 'Use extension background_page to run tests.')
    .option('--cov', 'Enable code coverage in istanbul format. Outputs \'.nyc_output/coverage-pw.json\'.')
    .option('--before', 'Path to a script to be loaded on a separate tab before the main script.')
    .option('--assets', 'Assets to be served by the http server.  (default process.cwd())')
    .option('--cwd', 'Current directory.  (default process.cwd())')
    .option('--extensions', 'File extensions allowed in the bundle.  (default js,cjs,mjs,ts,tsx)')
    .option('--config', 'Path to the config file')
    .action((input, opts) => {
        let config;

        if (opts.config) {
            config = lilconfig.lilconfigSync('playwright-test').load(path.resolve(opts.config));
        } else {
            config = lilconfig.lilconfigSync('playwright-test').search();
            if (!config) {
                config = lilconfig.lilconfigSync('pw-test').search();
            }
        }

        let Runner = null;

        switch (opts.runner) {
            case 'uvu':
                Runner = UvuRunner;
                break;
            case 'zora':
                Runner = ZoraRunner;
                break;
            case 'mocha':
                Runner = MochaRunner;
                break;
            case 'tape':
                Runner = TapeRunner;
                break;
            case 'benchmark':
                Runner = BenchmarkRunner;
                break;
            default:
                console.error('Runner not supported: ', opts.runner);
                process.exit(1);
        }
        const runner = new Runner(merge(
            config ? config.config : {},
            {
                cwd: opts.cwd,
                assets: opts.assets,
                browser: opts.browser,
                debug: opts.debug,
                mode: opts.mode,
                incognito: opts.incognito,
                input: [input, ...opts._],
                extension: opts.extension,
                runnerOptions: runnerOptions(opts),
                before: opts.before,
                node: opts.node,
                cov: opts.cov,
                extensions: opts.extensions
            }
        ));

        if (opts.watch) {
            runner.watch();
        } else {
            runner.run();
        }
    })
    .parse(process.argv);
