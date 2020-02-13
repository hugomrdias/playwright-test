/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const getPort = require('get-port');
const ora = require('ora');
const tempy = require('tempy');
const polka = require('polka');
const sirv = require('sirv');
const merge = require('merge-options');
const envPaths = require('env-paths')('playwright-test');
const { redirectConsole, getPw } = require('./utils');

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

class MochaRunner {
    constructor(options = {}) {
        this.options = merge(defaultOptions, options);
        this.server = null;
        this.browser = null;
        this.context = null;
        this.dir = tempy.directory();
        this.file = null;
        this.compiler = this.compiler();
        this.port = 3000;
        this.url = '';
        this.stopped = false;
        this.watching = false;
    }

    async launch() {
        const spinner = ora({ text: 'Setting up browser' }).start();
        const pw = await getPw(this.options.browser, envPaths.cache, spinner);

        this.port = await getPort({ port: this.port });
        this.url = 'http://localhost:' + this.port + '/';

        fs.copyFileSync(path.join(__dirname, './../static/index.html'), this.dir + '/index.html');
        fs.copyFileSync(path.join(__dirname, './../static/favicon.ico'), this.dir + '/favicon.ico');
        fs.copyFileSync(path.join(__dirname, './../static/manifest.json'), this.dir + '/manifest.json');
        fs.copyFileSync(path.join(__dirname, './../static/background.js'), this.dir + '/background.js');

        this.server = (await polka()
            .use(sirv(this.dir, {
                dev: true,
                setHeaders: (rsp, pathname) => {
                    if (pathname === '/') {
                        rsp.setHeader('Clear-Site-Data', '"cache", "cookies", "storage", "executionContexts"');
                    }
                }
            }))
            .listen(this.port))
            .server;

        this.browser = await pw.launch({
            headless: !this.options.extension && !this.options.debug,
            devtools: this.options.browser === 'chromium' && this.options.debug,
            args: this.options.extension ? [
                `--disable-extensions-except=${this.dir}`,
                `--load-extension=${this.dir}`
            ] : []
        });

        if (this.options.incognito) {
            this.context = await this.browser.newContext();
        } else {
            this.context = this.browser.defaultContext();
        }

        if (this.options.extension) {
            const targets = await this.browser.targets();
            const backgroundPageTarget = targets.find(target => target.type() === 'background_page');

            this.page = await backgroundPageTarget.page();

            // Open extension devtools window
            const extPage = await this.context.newPage(`chrome://extensions/?id=${backgroundPageTarget._targetInfo.url.split('/')[2]}`);

            const buttonHandle = await extPage.evaluateHandle('document.querySelector("body > extensions-manager").shadowRoot.querySelector("extensions-toolbar").shadowRoot.querySelector("#devMode")');

            await buttonHandle.click();

            const backgroundPageLink = await extPage.evaluateHandle('document.querySelector("body > extensions-manager").shadowRoot.querySelector("#viewManager > extensions-detail-view").shadowRoot.querySelector("#inspect-views > li:nth-child(2) > a")');

            await backgroundPageLink.click();
        } else {
            this.page = (await this.context.pages())[0];
            this.page.goto(this.url);
        }

        this.page.on('error', (err) => {
            console.error(err);
            this.stop(true);
        });
        this.page.on('pageerror', (err) => {
            console.error(err);
            this.stop(true);
        });
        this.page.on('console', redirectConsole);

        spinner.succeed('Setting up browser');

        return this;
    }

    async compile() {
        const spinner = ora('Bundling tests').start();
        const run = new Promise((resolve, reject) => {
            this.compiler.run((err, stats) => { // Stats Object
                if (err) {
                    console.error(err.stack || err);
                    if (err.details) {
                        console.error(err.details);
                    }

                    return reject(err);
                }

                const info = stats.toJson('normal');

                if (stats.hasErrors()) {
                    for (const error of info.errors) {
                        console.error(error);
                    }

                    return reject(new Error('stats errors'));
                }

                if (stats.hasWarnings()) {
                    for (const warn of info.warnings) {
                        console.warn(warn);
                    }
                }

                resolve(info.assets[0].name);
            });
        });

        this.file = await run;
        spinner.succeed();

        return this;
    }

    async runTests() {
        //
    }

    async waitForEnd() {
        if (!this.options.debug) {
            try {
                await this.page.waitForFunction('window.testsEnded', { timeout: 0 });
                const testsFailed = await this.page.evaluate('window.testsFailed');

                await this.stop(testsFailed > 0);
            } catch (err) {
                if (this.stopped) {
                    // ignore if already stopped by a previous error
                } else {
                    throw err;
                }
            }
        }
    }

    async run() {
        await this.launch();
        await this.compile();
        await this.runTests();
        await this.waitForEnd();
    }

    async watch() {
        let lastHash = null;

        await this.launch();
        this.compiler.watch({}, async (err, stats) => {
            if (err) {
                console.error(err.stack || err);
                if (err.details) {
                    console.error(err.details);
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
                    console.error(error);
                }

                return;
            }

            if (stats.hasWarnings()) {
                console.warn(info.warnings);
            }

            await this.page.reload();

            this.file = info.assets[0].name;
            await this.runTests();
            lastHash = stats.hash;
        });
    }

    async stop(fail) {
        if (this.stopped) {
            return;
        }
        this.stopped = true;

        await this.page.close();
        await this.browser.close();

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

module.exports = MochaRunner;
