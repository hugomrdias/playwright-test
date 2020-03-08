/* eslint-disable no-console */
/* eslint-disable no-undefined */
/* eslint-disable global-require */
'use strict';

const path = require('path');
const fs = require('fs');
const kleur = require('kleur');
const globby = require('globby');
const ignoreByDefault = require('ignore-by-default');

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

function toMegabytes(bytes) {
    const mb = bytes / 1024 / 1024;

    return `${Math.round(mb * 10) / 10} Mb`;
}

async function downloadBrowser(browserInstance, spinner) {
    const browser = browserInstance.name();
    const browserType = browserInstance;

    function onProgress(downloadedBytes, totalBytes) {
        const perc = Math.round((downloadedBytes / totalBytes) * 100);

        if (perc === 100) {
            spinner.text = `Unpacking ${browser} ${browserType._revision}`;
        } else {
            spinner.text = `Downloading ${browser} ${browserType._revision} - ${toMegabytes(totalBytes)} ${perc}%`;
        }
    }

    const fetcher = browserType._createBrowserFetcher();
    const revisionInfo = fetcher.revisionInfo();

    // Do nothing if the revision is already downloaded.
    if (revisionInfo.local) {
        return revisionInfo;
    }

    spinner.text = `Downloading ${browser} ${browserType._revision}`;
    await fetcher.download(revisionInfo.revision, onProgress);
    spinner.text = `Browser ${browser} cached to ${revisionInfo.folderPath}`;
    console.log(`Browser ${browser} cached to ${revisionInfo.folderPath}`);

    return revisionInfo;
}

const getPw = async (browserName, cachePath, spinner) => {
    const packageJson = require('playwright-core/package.json');
    const { helper } = require('playwright-core/lib/helper');
    const api = require('playwright-core/lib/api');
    const { Chromium } = require('playwright-core/lib/server/chromium');
    const { WebKit } = require('playwright-core/lib/server/webkit');
    const { Firefox } = require('playwright-core/lib/server/firefox');

    for (const className in api) {
        if (typeof api[className] === 'function') {
            helper.installApiHooks(className, api[className]);
        }
    }

    if (!fs.existsSync(cachePath)) {
        await fs.promises.mkdir(cachePath);
    }
    let browser = null;

    switch (browserName) {
        case 'chromium':
            browser = new Chromium(cachePath, packageJson.playwright.chromium_revision);

            break;
        case 'webkit':
            browser = new WebKit(cachePath, packageJson.playwright.webkit_revision);

            break;
        case 'firefox':
            browser = new Firefox(cachePath, packageJson.playwright.firefox_revision);

            break;

        default:
            throw new Error(`Browser ${browserName} not supported. Try chromium, webkit or firefox.`);
    }

    await downloadBrowser(browser, spinner);

    return browser;
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

module.exports = {
    extractErrorMessage,
    redirectConsole,
    defaultTestPatterns,
    findTests,
    findFiles,
    getPw,
    compile,
    addWorker
};
