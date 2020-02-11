/* eslint-disable no-undef */
/* eslint-disable strict */
// mocha library itself, to have it set up on global
require('mocha/mocha');
// styles needed by the html reporter
// require('!style-loader!css-loader!mocha/mocha.css');

// env variables injected via webpack.DefinePlugin
const ui = process.env.MOCHA_UI;
const reporter = process.env.MOCHA_REPORTER || 'spec';
const color = process.env.MOCHA_COLORS;
const timeout = process.env.MOCHA_TIMEOUT || 2000;

// html reporter needs a container
// if (reporter === 'html') {
//     const mochaContainer = document.createElement('div');

//     mochaContainer.id = 'mocha';
//     document.body.appendChild(mochaContainer);
// }

mocha.setup({
    ui,
    reporter,
    color,
    timeout
    // fgrep: 'fail'
});

