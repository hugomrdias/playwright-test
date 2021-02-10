/* eslint-disable unicorn/no-process-exit */
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const ora = require('ora');
const kleur = require('kleur');
const tempy = require('tempy');
const { premove } = require('premove/sync');
const merge = require('merge-options').bind({ ignoreUndefined: true });
const {
    redirectConsole,
    getPw,
    addWorker,
    findTests,
    defaultTestPatterns,
    createCov,
    createPolka
} = require('./utils');

/**
 * @typedef {import('playwright-core').Page} Page
 * @typedef {import('playwright-core').BrowserContext} Context
 * @typedef {import('playwright-core').Browser} Browser
 */

const defaultOptions = {
    cwd: process.cwd(),
    assets: '',
    browser: 'chromium',
    debug: false,
    mode: 'main', // worker
    incognito: false,
    input: null,
    extension: false,
    runnerOptions: {},
    before: null,
    node: true,
    cov: false,
    extensions: 'js,cjs,mjs,ts,tsx',
    buildConfig: {}
};

class Runner {
    constructor(options = {}) {
        this.options = merge(defaultOptions, options);
        this.server = null;
        /** @type {Browser} */
        this.browser = null;
        /** @type {Context} */
        this.context = null;
        /** @type {Page} */
        this.page = null;
        this.dir = tempy.directory();
        this.browserDir = tempy.directory();
        this.file = null;
        this.url = '';
        this.stopped = false;
        this.watching = false;
        this.env = merge(JSON.parse(JSON.stringify(process.env)), { PW_TEST: this.options });
        this.extensions = this.options.extensions.split(',');
        this.tests = findTests({
            cwd: this.options.cwd,
            extensions: this.extensions,
            filePatterns: this.options.input ?
                this.options.input :
                defaultTestPatterns(this.extensions)
        });
        if (this.tests.length === 0) {
            this.stop(false, 'No test files were found.');
        }
    }

    async launch() {
        // copy files to be served
        const files = [
            'index.html',
            'before.html',
            'favicon.ico',
            'manifest.json',
            'background.js',
            'setup.js'
        ];

        for (const file of files) {
            fs.copyFileSync(
                path.join(__dirname, './../static', file),
                path.join(this.dir, file)
            );
        }

        // setup http server
        await createPolka(this);

        // download playwright if needed
        const pw = await getPw(this.options.browser);
        const pwOptions = {
            headless: !this.options.extension && !this.options.debug,
            devtools: this.options.browser === 'chromium' && this.options.debug,
            args: this.options.extension ?
                [
                    `--disable-extensions-except=${this.dir}`,
                    `--load-extension=${this.dir}`
                ] :
                [],
            dumpio: process.env.PW_TEST_DUMPIO || false
        };

        // create context
        if (this.options.incognito) {
            this.browser = await pw.launch(pwOptions);
            this.context = await this.browser.newContext();
        } else {
            this.context = await pw.launchPersistentContext(
                this.browserDir,
                pwOptions
            );
        }

        return this;
    }

    async setupPage() {
        if (this.options.extension) {
            const backgroundPages = await this.context.backgroundPages();
            const backgroundPage = backgroundPages.length ?
                backgroundPages[0] :
                await this.context
                    .waitForEvent('backgroundpage')
                    .then(event => event);

            this.page = backgroundPage;
            if (this.options.debug) {
                // Open extension devtools window
                const extPage = await this.context.newPage();

                await extPage.goto(
                    `chrome://extensions/?id=${
                        this.page._mainFrame._initializer.url.split('/')[2]
                    }`
                );

                const buttonHandle = await extPage.evaluateHandle(
                    'document.querySelector("body > extensions-manager").shadowRoot.querySelector("extensions-toolbar").shadowRoot.querySelector("#devMode")'
                );

                await buttonHandle.click();

                const backgroundPageLink = await extPage.evaluateHandle(
                    'document.querySelector("body > extensions-manager").shadowRoot.querySelector("#viewManager > extensions-detail-view").shadowRoot.querySelector("#inspect-views > li:nth-child(2) > a")'
                );

                await backgroundPageLink.click();
            }
        } else if (this.options.incognito) {
            this.page = await this.context.newPage();
            await this.page.goto(this.url);
        } else {
            this.page = await this.context.pages()[0];
            await this.page.goto(this.url);
        }

        if (this.options.cov) {
            if (this.options.browser !== 'chromium') {
                await this.stop(true, 'Coverage is only supported in chromium');
            }
            await this.page.coverage.startJSCoverage();
        }

        this.page.on('crash', err => this.stop(true, err));
        this.page.on('error', err => this.stop(true, err));
        this.page.on('pageerror', (err) => {
            console.error(err);
            this.stop(true, 'Uncaught exception happened within the page. Run with --debug.');
        });
        this.page.on('console', redirectConsole);
    }

    async runTests() {
        await this.page.addScriptTag({ url: 'setup.js' });
        await this.page.evaluate(`localStorage.debug = "${this.env.DEBUG}"`);

        switch (this.options.mode) {
            case 'main': {
                await this.page.addScriptTag({ url: this.file });
                break;
            }
            case 'worker': {
                this.page.evaluate(addWorker(this.file));
                break;
            }
            default:
                await this.stop(true, 'mode not supported');
                break;
        }
    }

    async waitForTestsToEnd() {
        if (!this.options.debug) {
            try {
                await this.page.waitForFunction(() => self.PW_TEST.ended === true, undefined, { timeout: 0 });
                const testsFailed = await this.page.evaluate('self.PW_TEST.failed');

                await this.stop(testsFailed);
            } catch (err) {
                if (
                    err.message.includes('Protocol error (Runtime.callFunctionOn): Target closed') ||
                    err.message.includes('Protocol error (Runtime.callFunctionOn): Browser closed')
                ) {
                    console.error(kleur.yellow('\nBrowser was closed by an uncaught error.'));
                } else {
                    this.stop(true, err);
                }
            }
        }
    }

    async run() {
        let spinner = ora('Setting up browser').start();

        try {
            await this.launch();
            if (this.options.before) {
                await this.runBefore();
            }
            await this.setupPage();
            spinner.succeed('Browser setup');

            spinner = ora('Bundling tests').start();
            await this.compiler();
            spinner.succeed();
            await this.runTests();
            await this.waitForTestsToEnd();

            // Re run on page reload
            if (this.options.debug) {
                this.page.on('load', async () => {
                    await this.runTests();
                    await this.waitForTestsToEnd();
                });
            }
        } catch (err) {
            console.log(err);
            spinner.fail('Running tests failed.');
            await this.stop(true, err);
        }
    }

    async runBefore() {
        // setup before page
        this.pageBefore = await this.context.newPage();
        await this.pageBefore.goto(this.url + 'before.html');

        // listen to errors
        this.pageBefore.on('crash', (err) => {
            this.stop(true, `Before page:\n ${err}`);
        });
        this.pageBefore.on('error', (err) => {
            this.stop(true, `Before page:\n ${err}`);
        });
        this.pageBefore.on('pageerror', (err) => {
            this.stop(true, `Before page:\n ${err}`);
        });

        // redirect console.log
        this.pageBefore.on('console', redirectConsole);
        try {
            await this.compiler('before');
            await this.pageBefore.addScriptTag({ url: this.file });
        } catch (err) {
            await this.stop(true, err);
        }

        await this.pageBefore.waitForFunction('self.PW_TEST.beforeEnded', { timeout: 0 });
    }

    async watch() {
        const spinner = ora('Setting up browser').start();

        await this.launch();
        if (this.options.before) {
            spinner.text = 'Running before script';
            await this.runBefore();
        }
        await this.setupPage();

        spinner.succeed();

        this.compiler('watch');
    }

    async stop(fail, msg) {
        if (this.stopped || this.options.debug) {
            return;
        }
        this.stopped = true;

        if (this.options.cov && this.page && this.page.coverage) {
            await createCov(this, await this.page.coverage.stopJSCoverage());
        }

        if (this.context) {
            await this.context.close();
        }

        if (this.server) {
            const serverClose = new Promise((resolve, reject) => {
                this.server.close((err) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve();
                });
            });

            await serverClose;
        }

        premove(this.dir);
        premove(this.browserDir);

        if (fail && msg) {
            console.error(kleur.red('\n' + msg));
        } else if (msg) {
            console.log(msg);
        }
        process.exit(fail ? 1 : 0);
    }

    // eslint-disable-next-line no-unused-vars
    async compiler(mode) {
        //
    }
}

module.exports = Runner;
