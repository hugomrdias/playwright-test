/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const ora = require('ora');
const pw = require('playwright');
const tempy = require('tempy');
const polka = require('polka');
const sirv = require('sirv');
const merge = require('merge-options');
const {
    runMocha,
    runMochaWorker,
    addWorker,
    getCompiler,
    redirectConsole
} = require('./utils');

const defaultOptions = {
    browser: 'chromium',
    mode: 'main', // worker
    incognito: false,
    extension: false,
    debug: false,
    port: 3000,
    url: 'http://localhost:3000/',
    files: [],
    mochaOptions: {},
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
        this.compiler = getCompiler(
            this.options.files,
            this.dir,
            this.options.mochaOptions,
            this.options.webpackConfig
        );
    }

    async launch() {
        const spinner = ora('Setting up browser').start();

        fs.copyFileSync(path.join(__dirname, './../static/index.html'), this.dir + '/index.html');
        fs.copyFileSync(path.join(__dirname, './../static/favicon.ico'), this.dir + '/favicon.ico');
        fs.copyFileSync(path.join(__dirname, './../static/manifest.json'), this.dir + '/manifest.json');
        fs.copyFileSync(path.join(__dirname, './../static/background.js'), this.dir + '/background.js');

        this.server = (await polka().use(sirv(this.dir, { dev: true })).listen(this.options.port)).server;
        this.browser = await pw[this.options.browser].launch({
            headless: !this.options.extension && !this.options.debug,
            devtools: this.options.browser === 'chromium' && this.options.debug,
            args: this.options.extension ? [
                `--disable-extensions-except=${this.dir}`,
                `--load-extension=${this.dir}`
            ] : []
        });

        if (this.options.incognito) {
            this.context = await this.browser.newContext(); // incognito
        } else {
            this.context = this.browser.defaultContext();
        }

        if (this.options.extension) {
            const targets = await this.browser.targets();
            const backgroundPageTarget = targets.find(target => target.type() === 'background_page');

            this.page = await backgroundPageTarget.page();
        } else {
            this.page = await this.context.newPage(this.options.url);
        }

        this.page.on('error', this.stop);
        this.page.on('pageerror', this.stop);
        this.page.on('console', redirectConsole);

        spinner.succeed();

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
        switch (this.options.mode) {
            case 'main': {
                await this.page.addScriptTag({
                    type: 'text/javascript',
                    url: this.file
                });

                this.page.evaluate(runMocha());
                break;
            }
            case 'worker': {
                this.page.evaluate(addWorker(this.file));
                const run = new Promise((resolve) => {
                    this.page.on('workercreated', (worker) => {
                        setTimeout(() => {
                            worker.evaluate(runMochaWorker());
                            resolve();
                        }, 1000);
                    });
                });

                await run;
                break;
            }
            default:
                console.error('mode not supported');
                break;
        }
    }

    async run() {
        await this.launch();
        await this.compile();
        await this.runTests();
        if (!this.options.debug) {
            await this.page.waitForFunction('window.mochaFinished', { timeout: 0 });
            await this.stop();
        }
    }

    async watch() {
        // TODO: extension mode can't close page and create new one
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

            if (this.page) {
                await this.page.close();
            }
            this.page = await this.context.newPage(this.options.url);
            this.page.on('console', redirectConsole);
            this.file = info.assets[0].name;
            await this.runTests();
            lastHash = stats.hash;
        });
    }

    async stop() {
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
    }
}

module.exports = MochaRunner;
