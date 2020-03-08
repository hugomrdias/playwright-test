/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const getPort = require('get-port');
const ora = require('ora');
const kleur = require('kleur');
const tempy = require('tempy');
const polka = require('polka');
const sirv = require('sirv');
const merge = require('merge-options');
const envPaths = require('env-paths')('playwright-test');
const { redirectConsole, getPw, compile } = require('./utils');

const defaultOptions = {
    browser: 'chromium',
    mode: 'main', // worker
    incognito: false,
    extension: false,
    debug: false,
    files: [],
    runnerOptions: {},
    webpackConfig: {}
};

class Runner {
    constructor(options = {}) {
        this.options = merge(defaultOptions, options);
        this.server = null;
        this.browser = null;
        this.context = null;
        this.dir = tempy.directory();
        this.file = null;
        this.url = '';
        this.stopped = false;
        this.watching = false;
        this.env = merge(
            JSON.parse(JSON.stringify(process.env)),
            { PW_TEST: this.options }
        );
    }

    async launch(spinner) {
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
        const pw = await getPw(this.options.browser, envPaths.cache, spinner);
        const pwOptions = {
            headless: !this.options.extension && !this.options.debug,
            devtools: this.options.browser === 'chromium' && this.options.debug,
            args: this.options.extension ? [
                `--disable-extensions-except=${this.dir}`,
                `--load-extension=${this.dir}`
            ] : [],
            dumpio: true
        };

        // extension only works in incognito for now
        if (this.options.incognito || this.options.extension) {
            this.browser = await pw.launch(pwOptions);
            this.context = await this.browser.newContext();
        } else {
            this.context = await pw.launchPersistent(undefined, pwOptions);
        }

        return this;
    }

    async setupPage() {
        if (this.options.extension) {
            const targets = await this.context.targets();
            const backgroundPageTarget = targets.find(target => target.type() === 'background_page');

            this.page = await backgroundPageTarget.page();

            // Open extension devtools window
            // const extPage = await this.context.newPage();

            // await extPage.goto(`chrome://extensions/?id=${backgroundPageTarget._targetInfo.url.split('/')[2]}`);

            // const buttonHandle = await extPage.evaluateHandle('document.querySelector("body > extensions-manager").shadowRoot.querySelector("extensions-toolbar").shadowRoot.querySelector("#devMode")');

            // await buttonHandle.click();

            // const backgroundPageLink = await extPage.evaluateHandle('document.querySelector("body > extensions-manager").shadowRoot.querySelector("#viewManager > extensions-detail-view").shadowRoot.querySelector("#inspect-views > li:nth-child(2) > a")');

            // await backgroundPageLink.click();
        } else {
            this.page = await this.context.newPage();
            await this.page.goto(this.url);
        }

        this.page.on('error', (err) => {
            console.error('\n', kleur.red(err));
            this.stop(true);
        });
        this.page.on('pageerror', (err) => {
            console.error('\n', kleur.red(err));
            this.stop(true);
        });
        this.page.on('console', redirectConsole);

        await this.page.addScriptTag({
            type: 'text/javascript',
            url: 'setup.js'
        });
    }

    async runTests() {
        //
    }

    async waitForTestsToEnd() {
        if (!this.options.debug) {
            await this.page.waitForFunction('self.pwTestController.ended === true', { timeout: 0 });
            const testsFailed = await this.page.evaluate('self.pwTestController.failed');

            await this.stop(testsFailed);
        }
    }

    async run() {
        let spinner = ora('Setting up browser').start();

        try {
            await this.launch(spinner);
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
            if (this.stopped) {
                // ignore if already stopped by a previous error
            } else {
                spinner.fail(err.message);
                throw err;
            }
        }
    }

    async runBefore() {
        // setup before page
        this.pageBefore = await this.context.newPage();
        await this.pageBefore.goto(this.url + 'before.html');
        this.pageBefore.on('error', (err) => {
            console.error('\n', kleur.dim('Before page '), kleur.red(err));
            this.stop(true);
        });
        this.pageBefore.on('pageerror', (err) => {
            console.error('\n', kleur.dim('Before page '), kleur.red(err));
            this.stop(true);
        });
        this.pageBefore.on('console', redirectConsole);

        // setup compiler
        const compiler = webpack({
            mode: 'development',
            output: {
                path: this.dir,
                filename: 'before.[hash].js',
                devtoolModuleFilenameTemplate: info =>
                    'file:///' + encodeURI(info.absoluteResourcePath)
            },
            entry: [
                require.resolve('../static/setup.js'),
                this.options.before
            ],
            node: {
                'dgram': 'empty',
                'fs': 'empty',
                'net': 'empty',
                'tls': 'empty',
                'child_process': 'empty',
                'console': false,
                'global': true,
                'process': true,
                '__filename': 'mock',
                '__dirname': 'mock',
                'Buffer': true,
                'setImmediate': true
            },
            plugins: [
                new webpack.DefinePlugin({ 'process.env': JSON.stringify(this.env) })
            ]
        });

        await this.pageBefore.addScriptTag({
            type: 'text/javascript',
            url: await compile(compiler)
        });

        await this.pageBefore.waitForFunction('self.pwTestController.beforeEnded', { timeout: 0 });
    }

    async watch() {
        let lastHash = null;
        const spinner = ora('Setting up browser').start();

        await this.launch(spinner);
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

    async stop(fail) {
        if (this.stopped || this.options.debug) {
            return;
        }
        this.stopped = true;

        await this.context.close();

        const serverClose = new Promise((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });

        await serverClose;
        // eslint-disable-next-line unicorn/no-process-exit
        process.exit(fail ? 1 : 0);
    }

    compiler() {
        //
    }
}

module.exports = Runner;
