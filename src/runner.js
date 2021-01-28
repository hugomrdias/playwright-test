/* eslint-disable unicorn/no-process-exit */
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const { promisify } = require('util');
const path = require('path');
const webpack = require('webpack');
const mergeWebpack = require('webpack-merge');
const getPort = require('get-port');
const ora = require('ora');
const kleur = require('kleur');
const tempy = require('tempy');
const polka = require('polka');
const sirv = require('sirv');
const V8ToIstanbul = require('v8-to-istanbul');
const merge = require('merge-options').bind({ ignoreUndefined: true });
const pEachSeries = require('p-each-series');
const { redirectConsole, getPw, compile, addWorker, defaultWebpackConfig, findTests, defaultTestPatterns } = require('./utils');

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

/**
 * @typedef {import('playwright-core').Page} Page
 * @typedef {import('playwright-core').BrowserContext} Context
 * @typedef {import('playwright-core').Browser} Browser
 */

/**
 * @type {object}
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
    extensions: 'js,cjs,mjs',
    webpackConfig: {}
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
        this.file = null;
        this.url = '';
        this.stopped = false;
        this.watching = false;
        this.env = merge(
            JSON.parse(JSON.stringify(process.env)),
            { PW_TEST: this.options }
        );
        this.extensions = this.options.extensions.split(',');
        this.tests = findTests({
            cwd: this.options.cwd,
            extensions: this.extensions,
            filePatterns: this.options.input ? this.options.input : defaultTestPatterns(this.extensions)
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
            fs.copyFileSync(path.join(__dirname, './../static', file), path.join(this.dir, file));
        }

        // setup http server
        const port = await getPort({ port: 3000 });

        this.url = 'http://localhost:' + port + '/';
        this.server = (await polka()
            .use(sirv(this.dir, {
                dev: true,
                setHeaders: (rsp, pathname) => {
                    if (pathname === '/') {
                        rsp.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
                        // rsp.setHeader('Clear-Site-Data', '"cache", "cookies", "storage", "executionContexts"');
                    }
                }
            }))
            .use(sirv(path.join(this.options.cwd, this.options.assets), { dev: true }))
            .listen(port))
            .server;

        // download playwright if needed
        const pw = await getPw(this.options.browser);
        const pwOptions = {
            chromiumSandbox: false,
            headless: !this.options.extension && !this.options.debug,
            devtools: this.options.browser === 'chromium' && this.options.debug,
            args: this.options.extension ? [
                `--disable-extensions-except=${this.dir}`,
                `--load-extension=${this.dir}`,
                '--disable-setuid-sandbox'
            ] : [],
            dumpio: process.env.PW_TEST_DUMPIO || false,
            env: { HUGO: 100 }
        };

        if (this.options.incognito) {
            this.browser = await pw.launch(pwOptions);
            this.context = await this.browser.newContext();
        } else {
            this.context = await pw.launchPersistentContext(this.dir, pwOptions);
        }

        return this;
    }

    async setupPage() {
        if (this.options.extension) {
            const backgroundPages = await this.context.backgroundPages();
            const backgroundPage = backgroundPages.length ?
                backgroundPages[0] :
                await this.context.waitForEvent('backgroundpage').then(event => event);

            this.page = backgroundPage;
            if (this.options.debug) {
                // Open extension devtools window
                const extPage = await this.context.newPage();

                await extPage.goto(`chrome://extensions/?id=${this.page._mainFrame._initializer.url.split('/')[2]}`);

                const buttonHandle = await extPage.evaluateHandle('document.querySelector("body > extensions-manager").shadowRoot.querySelector("extensions-toolbar").shadowRoot.querySelector("#devMode")');

                await buttonHandle.click();

                const backgroundPageLink = await extPage.evaluateHandle('document.querySelector("body > extensions-manager").shadowRoot.querySelector("#viewManager > extensions-detail-view").shadowRoot.querySelector("#inspect-views > li:nth-child(2) > a")');

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
            await this.page.coverage.startJSCoverage();
        }

        this.page.on('error', err => this.stop(true, `\n${kleur.red(err)}`));
        this.page.on('pageerror', err => this.stop(true, `\n${kleur.red(err)}`));
        this.page.on('crash', err => this.stop(true, `\n${kleur.red(err)}`));
        this.page.on('console', redirectConsole);
    }

    async runTests() {
        await this.page.addScriptTag({
            type: 'text/javascript',
            url: 'setup.js'
        });
        await this.page.evaluate(`localStorage.debug = "${this.env.DEBUG}"`);

        switch (this.options.mode) {
            case 'main': {
                await this.page.addScriptTag({
                    type: 'text/javascript',
                    url: this.file
                });

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
            await this.page.waitForFunction('self.PW_TEST.ended === true', { timeout: 0 });
            const testsFailed = await this.page.evaluate('self.PW_TEST.failed');

            await this.stop(testsFailed);
        }
    }

    async run() {
        let spinner = ora('Setting up browser').start();

        try {
            await this.launch();
            if (this.options.before) {
                spinner.text = 'Running before script';
                await this.runBefore();
            }
            await this.setupPage();
            spinner.succeed('Browser setup');
            spinner = ora('Bundling tests').start();
            this.file = await compile(this.compiler());
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
            spinner.fail();
            this.stop(true, err);
        }
    }

    async runBefore() {
        // setup before page
        this.pageBefore = await this.context.newPage();
        await this.pageBefore.goto(this.url + 'before.html');

        // listen to errors
        this.pageBefore.on('error', (err) => {
            this.stop(true, `\n${kleur.dim('Before page')} ${kleur.red(err)}`);
        });
        this.pageBefore.on('pageerror', (err) => {
            this.stop(true, `\n${kleur.dim('Before page')} ${kleur.red(err)}`);
        });
        this.pageBefore.on('crash', (err) => {
            this.stop(true, `\n${kleur.dim('Before page')} ${kleur.red(err)}`);
        });

        // redirect console.log
        this.pageBefore.on('console', redirectConsole);

        // setup compiler
        const config = mergeWebpack(
            defaultWebpackConfig(this.dir, this.env, this.options, 'before'),
            {
                entry: [
                    require.resolve('../static/setup.js'),
                    require.resolve(this.options.before)
                ]
            }
        );
        const compiler = webpack(config);

        await this.pageBefore.addScriptTag({
            type: 'text/javascript',
            url: await compile(compiler)
        });

        await this.pageBefore.waitForFunction('self.PW_TEST.beforeEnded', { timeout: 0 });
    }

    async watch() {
        let lastHash = null;
        const spinner = ora('Setting up browser').start();

        await this.launch();
        await this.setupPage();
        const compiler = this.compiler();

        spinner.succeed();
        compiler.watch({}, async (err, stats) => {
            if (err) {
                console.error('\n', kleur.red(err.stack || err));
                if (err.details) {
                    console.error(kleur.gray(err.details));
                }

                return;
            }
            const info = stats.toJson('normal');

            if (stats.hash === lastHash) {
                console.log('Skip for hash: ', stats.hash);

                return;
            }

            if (stats.hasErrors()) {
                for (const error of info.errors) {
                    console.error('\n', kleur.red(error));
                }

                return;
            }

            if (stats.hasWarnings()) {
                for (const warn of info.warnings) {
                    console.warn('\n', kleur.yellow(warn));
                }
            }

            await this.page.reload();
            this.file = info.assets[0].name;
            await this.runTests();
            lastHash = stats.hash;
        });
    }

    async stop(fail, msg) {
        if (this.stopped || this.options.debug) {
            return;
        }
        this.stopped = true;

        if (this.options.cov && this.page) {
            const coverage = await this.page.coverage.stopJSCoverage();
            const entries = {};

            await pEachSeries(coverage, async (entry) => {
                const filePath = path.normalize(entry.url).replace('file:', '');

                // remove test files
                if (this.options.files.includes(filePath)) {
                    return;
                }

                // remove random stuff
                if (!fs.existsSync(filePath) || entry.url.includes('node_modules') || !entry.url.includes(this.options.cwd)) {
                    return;
                }
                const converter = new V8ToIstanbul(filePath, 0, { source: entry.source });

                await converter.load();
                converter.applyCoverage(entry.functions);
                const instanbul = converter.toIstanbul();

                entries[filePath] = instanbul[filePath];
            });
            await mkdir(path.join(process.cwd(), '.nyc_output'), { recursive: true });
            await writeFile(path.join(process.cwd(), '.nyc_output', 'out.json'), JSON.stringify(entries));
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

        if (fail && msg) {
            console.error(msg);
        } else if (msg) {
            console.log(msg);
        }
        process.exit(fail ? 1 : 0);
    }

    compiler() {
        //
    }
}

module.exports = Runner;
