/* eslint-disable no-console */
/* eslint-disable no-undefined */
/* eslint-disable global-require */
'use strict';

const path = require('path');
const fs = require('fs');
const kleur = require('kleur');
const globby = require('globby');
const ignoreByDefault = require('ignore-by-default');
const webpack = require('webpack');

const defaultIgnorePatterns = [...ignoreByDefault.directories(), '**/node_modules'];

const hasExtension = (extensions, file) => extensions.includes(path.extname(file).slice(1));

const buildExtensionPattern = extensions => (extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`);

const defaultTestPatterns = (extensions) => {
    const extensionPattern = buildExtensionPattern(extensions);

    return [
        `test.${extensionPattern}`,
        `{src,source}/test.${extensionPattern}`,
        `**/__tests__/**/*.${extensionPattern}`,
        `**/*.spec.${extensionPattern}`,
        `**/*.test.${extensionPattern}`,
        `**/test-*.${extensionPattern}`,
        `**/test/**/*.${extensionPattern}`,
        `**/tests/**/*.${extensionPattern}`
        // '!**/__tests__/**/__{helper,fixture}?(s)__/**/*',
        // '!**/test?(s)/**/{helper,fixture}?(s)/**/*'
    ];
};

const globFiles = (cwd, patterns) => {
    const files = globby.sync(patterns, {
        absolute: false,
        braceExpansion: true,
        caseSensitiveMatch: false,
        cwd,
        dot: false,
        expandDirectories: false,
        extglob: true,
        followSymbolicLinks: true,
        gitignore: false,
        globstar: true,
        ignore: defaultIgnorePatterns,
        baseNameMatch: false,
        onlyFiles: true,
        stats: false,
        unique: true
    });

    // Return absolute file paths. This has the side-effect of normalizing paths
    // on Windows.
    return files.map(file => path.join(cwd, file));
};

const findFiles = ({ cwd, extensions, filePatterns }) => (globFiles(cwd, filePatterns)).filter(file => hasExtension(extensions, file));

const findTests = ({ cwd, extensions, filePatterns }) => (findFiles({
    cwd,
    extensions,
    filePatterns
})).filter(file => !path.basename(file).startsWith('_'));

// workaround to get hidden description
// jsonValue() on errors returns {}
const extractErrorMessage = (arg) => {
    // pup-firefox doesnt have this
    if (arg._remoteObject) {
        return arg._remoteObject.subtype === 'error' ? arg._remoteObject.description : undefined;
    }

    return undefined;
};

const messageTypeToConsoleFn = {
    log: console.log,
    warning: console.warn,
    error: console.error,
    info: console.info,
    assert: console.assert,
    debug: console.debug,
    trace: console.trace,
    dir: console.dir,
    dirxml: console.dirxml,
    profile: console.profile,
    profileEnd: console.profileEnd,
    startGroup: console.group,
    startGroupCollapsed: console.groupCollapsed,
    endGroup: console.groupEnd,
    table: console.table,
    count: console.count,
    timeEnd: console.timeEnd

    // we ignore calls to console.clear, as we don't want the page to clear our terminal
    // clear: console.clear
};
const redirectConsole = async (msg) => {
    const type = msg.type();
    const consoleFn = messageTypeToConsoleFn[msg.type()];

    if (!consoleFn) {
        return;
    }
    const text = msg.text();
    const { url, lineNumber, columnNumber } = msg.location();
    const msgArgs = await Promise.all(msg.args().map(arg => extractErrorMessage(arg) || arg.jsonValue()));

    if (msgArgs.length > 0) {
        consoleFn.apply(console, msgArgs);
    } else if (text) {
        let color = 'white';

        switch (type) {
            case 'error':
                color = 'red';
                break;
            case 'warning':
                color = 'yellow';
                break;
            case 'info':
            case 'debug':
                color = 'blue';
                break;
            default:
                break;
        }

        consoleFn(kleur[color](text));

        console.info(kleur.gray(`${url}${lineNumber ? (':' + lineNumber) + (columnNumber ? ':' + columnNumber : '') : ''}`));
    }
};

const getPw = async (browserName) => {
    const cachePath = path.join(process.cwd(), 'node_modules', '.cache');

    if (process.env.CI) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = cachePath;
    }
    const { installBrowsersWithProgressBar } = require('playwright-core/lib/install/installer');
    const { Playwright } = require('playwright-core/lib/server/playwright');
    const { setupInProcess } = require('playwright-core/lib/inprocess');
    const browsers = JSON.parse(fs.readFileSync('./node_modules/playwright-core/browsers.json').toString());

    browsers.browsers[0].download = true; // chromium
    browsers.browsers[1].download = true; // firefox
    browsers.browsers[2].download = true; // webkit
    fs.mkdirSync(cachePath, { recursive: true });
    fs.writeFileSync(path.join(cachePath, 'browsers.json'), JSON.stringify(browsers, null, 2));
    await installBrowsersWithProgressBar(cachePath);
    const api = setupInProcess(new Playwright(cachePath, browsers.browsers));

    return api[browserName];
};

const compile = async (compiler) => {
    const run = new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            if (err) {
                console.error('\n', kleur.red(err.stack || err));
                if (err.details) {
                    console.error(kleur.gray(err.details));
                }

                return reject(err);
            }

            const info = stats.toJson('normal');

            if (stats.hasErrors()) {
                for (const error of info.errors) {
                    console.error('\n', kleur.red(error));
                }

                return reject(new Error('stats errors'));
            }

            if (stats.hasWarnings()) {
                for (const warn of info.warnings) {
                    console.warn('\n', kleur.yellow(warn));
                }
            }

            resolve(info.assets[0].name);
        });
    });

    const file = await run;

    return file;
};

const addWorker = filePath => `
const w = new Worker("${filePath}");
w.onmessage = function(e) {
    if(e.data.pwRunEnded) {
        self.pwTestController.end(e.data.pwRunFailed)
    }
}
`;

const defaultWebpackConfig = (dir, env, options) => {
    return {
        mode: 'development',
        output: {
            path: dir,
            filename: 'bundle.[hash].js',
            devtoolModuleFilenameTemplate: info =>
                'file:///' + encodeURI(info.absoluteResourcePath)
        },
        node: options.node ? {
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
        } : {
            'global': true,
            '__filename': 'mock',
            '__dirname': 'mock',
            'dgram': false,
            'fs': false,
            'net': false,
            'tls': false,
            'child_process': false,
            'console': false,
            'process': false,
            'Buffer': false,
            'setImmediate': false,
            'os': false,
            'assert': false,
            'constants': false,
            'events': false,
            'http': false,
            'path': false,
            'querystring': false,
            'stream': false,
            'string_decoder': false,
            'timers': false,
            'url': false,
            'util': false,
            'crypto': false
        },
        plugins: [
            new webpack.DefinePlugin({ 'process.env': JSON.stringify(env) })
        ]

    };
};

module.exports = {
    extractErrorMessage,
    redirectConsole,
    defaultTestPatterns,
    findTests,
    findFiles,
    getPw,
    compile,
    addWorker,
    defaultWebpackConfig
};
