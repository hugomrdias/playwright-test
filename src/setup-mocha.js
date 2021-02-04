'use strict';

/* eslint-disable no-undef */

// mocha library itself, to have it set up on global
require('mocha/mocha');

const {
    allowUncaught,
    bail,
    reporter,
    timeout,
    color,
    ui
} = process.env.PW_TEST.runnerOptions;

mocha.setup({
    allowUncaught,
    bail,
    reporter,
    timeout,
    color,
    ui
});
