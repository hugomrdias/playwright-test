'use strict';

/* eslint-disable no-undef */

// mocha library itself, to have it set up on global
require('mocha/mocha');

// env variables injected via webpack.DefinePlugin
mocha.setup(PW_TEST_ENV.PW_TEST.runnerOptions);

