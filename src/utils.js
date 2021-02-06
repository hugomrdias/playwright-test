/* eslint-disable valid-jsdoc */
/* eslint-disable camelcase */
/* eslint-disable no-undefined */
/* eslint-disable global-require */
/* eslint-disable no-console */
'use strict';

const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const esbuild = require('esbuild');
const kleur = require('kleur');
const globby = require('globby');
const ora = require('ora');
const camelCase = require('camelcase');
const V8ToIstanbul = require('v8-to-istanbul');
const merge = require('merge-options').bind({
    ignoreUndefined: true,
    concatArrays: true
});

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

const defaultIgnorePatterns = [
    '.git', // Git repository files, see <https://git-scm.com/>
    '.log', // Log files emitted by tools such as `tsserver`, see <https://github.com/Microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29>
    '.nyc_output', // Temporary directory where nyc stores coverage data, see <https://github.com/bcoe/nyc>
    '.sass-cache', // Cache folder for node-sass, see <https://github.com/sass/node-sass>
    'bower_components', // Where Bower packages are installed, see <http://bower.io/>
    'coverage', // Standard output directory for code coverage reports, see <https://github.com/gotwarlost/istanbul>
    'node_modules', // Where Node modules are installed, see <https://nodejs.org/>,
    '**/node_modules',
    '**/__tests__/**/__{helper,fixture}?(s)__/**/*',
    '**/test?(s)/**/{helper,fixture}?(s)/**/*'
];

const hasExtension = (extensions, file) =>
    extensions.includes(path.extname(file).slice(1));

const buildExtensionPattern = extensions =>
    (extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`);

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
    ];
};

const globFiles = (cwd, patterns) => {
    const files = globby.sync(patterns, {
        absolute: false,
        braceExpansion: true,
        caseSensitiveMatch: false,
        cwd,
        dot: false,
        expandDirectories: true,
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

const findFiles = ({ cwd, extensions, filePatterns }) =>
    globFiles(cwd, filePatterns).filter(file =>
        hasExtension(extensions, file)
    );

const findTests = ({ cwd, extensions, filePatterns }) =>
    findFiles({
        cwd,
        extensions,
        filePatterns
    }).filter(file => !path.basename(file).startsWith('_'));

// workaround to get hidden description
// jsonValue() on errors returns {}
const extractErrorMessage = (arg) => {
    // pup-firefox doesnt have this
    if (arg._remoteObject) {
        return arg._remoteObject.subtype === 'error' ?
            arg._remoteObject.description :
            undefined;
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
    const msgArgs = await Promise.all(
        msg.args().map(arg => extractErrorMessage(arg) || arg.jsonValue())
    );

    if (msgArgs.length > 0) {
        consoleFn.apply(console, msgArgs);
    } else if (text) {
        let color = 'white';

        if (text.includes('Synchronous XMLHttpRequest on the main thread is deprecated')) {
            return;
        }
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

        console.info(
            kleur.gray(
                `${url}${
                    lineNumber ?
                        ':' +
                          lineNumber +
                          (columnNumber ? ':' + columnNumber : '') :
                        ''
                }`
            )
        );
    }
};

const getPw = async (browserName) => {
    const cachePath = path.join(process.cwd(), 'node_modules', '.cache');

    if (process.env.CI) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = cachePath;
    }
    const { installBrowsersWithProgressBar } = require('playwright-core/lib/install/installer');
    const setupInProcess = require('playwright-core/lib/inprocess');
    const browsers = require('playwright-core/browsers.json');

    browsers.browsers[0].download = true; // chromium
    browsers.browsers[1].download = true; // firefox
    browsers.browsers[2].download = true; // webkit
    fs.mkdirSync(cachePath, { recursive: true });
    fs.writeFileSync(
        path.join(cachePath, 'browsers.json'),
        JSON.stringify(browsers, null, 2)
    );
    await installBrowsersWithProgressBar(cachePath, [browserName]);
    const api = setupInProcess;

    return api[browserName];
};

const addWorker = filePath => `
const w = new Worker("${filePath}");
w.onmessage = function(e) {
    if(e.data.pwRunEnded) {
        self.PW_TEST.end(e.data.pwRunFailed)
    }
}
`;

const runnerOptions = (flags) => {
    const opts = {};

    // eslint-disable-next-line guard-for-in
    for (const key in flags) {
        const value = flags[key];
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
            'before',
            'node',
            'cov',
            'config',
            '_',
            'd',
            'r',
            'b',
            'm',
            'w',
            'i',
            'e'
        ];

        if (!localFlags.includes(key)) {
            opts[camelCase(key)] = value;
        }
    }

    return opts;
};

/**
 * Build the bundle
 *
 * @param {import("./runner")} runner
 * @param {any} config - Runner esbuild config
 * @param {string} tmpl
 * @param {"bundle" | "before" | "watch"} mode
 */
const build = async (runner, config = {}, tmpl = '', mode = 'bundle') => {
    const outName = `${mode}-out.js`;
    const infile = path.join(runner.dir, 'in.js');
    const outfile = path.join(runner.dir, outName);
    const sourceMapSupport = require.resolve('./vendor/source-map-support');
    const nodeGlobalsInject = path.join(__dirname, 'node-globals.js');
    const nodePlugin = {
        name: 'node built ins',
        setup(build) {
            build.onResolve({ filter: /^path$/ }, () => {
                return { path: require.resolve('path-browserify') };
            });
        }
    };

    // watch mode
    const watch = {
        onRebuild: async (error) => {
            if (!error) {
                await runner.page.reload();
                runner.file = outName;
                await runner.runTests();
            }
        }
    };

    // main script template
    let infileContent = `
'use strict'
require('${sourceMapSupport}').install();
process.env = ${JSON.stringify(runner.env)}
${tmpl}

${runner.tests.map(t => `require('${t}')`).join('\n')}
`;

    // before script template
    if (mode === 'before') {
        infileContent = `
'use strict'
require('${sourceMapSupport}').install();
process.env = ${JSON.stringify(runner.env)}

require('${require.resolve('../static/setup.js')}')
require('${require.resolve(path.join(runner.options.cwd, runner.options.before))}')
`;
    }

    fs.writeFileSync(infile, infileContent);
    await esbuild.build(merge(
        {
            entryPoints: [infile],
            bundle: true,
            mainFields: ['browser', 'module', 'main'],
            sourcemap: 'inline',
            plugins: [nodePlugin],
            outfile,
            inject: [nodeGlobalsInject],
            watch: mode === 'watch' ? watch : false,
            define: { 'PW_TEST_SOURCEMAP': runner.options.debug ? 'false' : 'true' }
        },
        config,
        runner.options.buildConfig
    ));

    runner.file = outName;

    return outName;
};

/**
 *
 * @param {import("./runner")} runner
 * @param {any} coverage
 */
const createCov = async (runner, coverage) => {
    const spinner = ora('Generating code coverage.').start();
    const entries = {};
    const { cwd } = runner.options;

    for (const entry of coverage) {
        const filePath = path.join(runner.dir, entry.url.replace(runner.url, ''));

        if (filePath.includes(runner.file)) {
            const converter = new V8ToIstanbul(filePath, 0, { source: entry.source });

            // eslint-disable-next-line no-await-in-loop
            await converter.load();
            converter.applyCoverage(entry.functions);
            const instanbul = converter.toIstanbul();

            // eslint-disable-next-line guard-for-in
            for (const key in instanbul) {
                // remove random stuff
                if (
                    !key.includes('node_modules') &&
                    !runner.tests.includes(key) &&
                    !key.includes('playwright-test/src') &&
                    !key.includes(path.join(runner.dir, 'in.js'))
                ) {
                    entries[key] = instanbul[key];
                }
            }
        }
    }
    const covPath = path.join(cwd, '.nyc_output');

    await mkdir(covPath, { recursive: true });
    await writeFile(path.join(covPath, 'out.json'), JSON.stringify(entries));
    spinner.succeed('Code coverage generated, run "npx nyc report".');
};

module.exports = {
    extractErrorMessage,
    redirectConsole,
    defaultTestPatterns,
    findTests,
    findFiles,
    getPw,
    addWorker,
    runnerOptions,
    build,
    createCov
};
