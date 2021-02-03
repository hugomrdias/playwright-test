'use strict';

/* eslint-disable no-undef */

// mocha library itself, to have it set up on global
require('mocha/mocha');

// env variables injected via webpack.DefinePlugin
mocha.setup(process.env.PW_TEST.runnerOptions);

