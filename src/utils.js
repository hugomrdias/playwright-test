/* eslint-disable no-unused-vars */
'use strict';

const merge = require('merge-options');
const webpack = require('webpack');

// const pup = require('puppeteer');
// const pupFire = require('puppeteer-firefox');

const runMocha = () => `
window.mochaFinished = false
mocha.run().on('end', () => {
    window.mochaFinished = true
})
`;

const runMochaWorker = () => `
mocha.run().on('end', () => {
    postMessage('end');
})
`;

const addWorker = filePath => `
window.mochaFinished = false
const w = new Worker("${filePath}");
w.onmessage = function(e) {
    window.mochaFinished = true
}
`;

// workaround to get hidden description
// jsonValue() on errors returns {}
const extractErrorMessage = (arg) => {
    // pup-firefox doesnt have this
    if (arg._remoteObject) {
        return arg._remoteObject.subtype === 'error' ? arg._remoteObject.description : undefined;
    }

    return undefined;
};

const getCompiler = (files, outputDir, mochaOptions, webpackConfig) => {
    const options = merge({
        // reporter: 'html',
        timeout: 5000,
        colors: true,
        ui: 'bdd'
    }, mochaOptions);

    const compiler = webpack({
        mode: 'development',
        // devtool: 'cheap-module-source-map',
        output: {
            // globalObject: 'self',
            path: outputDir,
            filename: 'bundle.[hash].js',
            devtoolModuleFilenameTemplate: info =>
                'file:///' + encodeURI(info.absoluteResourcePath)
        },
        entry: [
            require.resolve('./mocha-setup.js'),
            ...files
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
            // inject options to mocha-setup.js (in "static" folder)
            new webpack.DefinePlugin({
                'process.env': {
                    MOCHA_UI: JSON.stringify(options.ui),
                    MOCHA_COLORS: options.colors,
                    MOCHA_REPORTER: JSON.stringify(options.reporter),
                    MOCHA_TIMEOUT: options.timeout
                }
            })
        ]

    });

    return compiler;
};

const redirectConsole = async (msg) => {
    const msgArgs = await Promise.all(msg.args().map(arg => extractErrorMessage(arg) || arg.jsonValue()));

    console[msg._type].apply(console, msgArgs);
};

module.exports = {
    runMocha,
    runMochaWorker,
    addWorker,
    extractErrorMessage,
    getCompiler,
    redirectConsole
};
