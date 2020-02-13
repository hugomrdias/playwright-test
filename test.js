'use strict';

const test = require('ava');
const m = require('.');

test('title', (t) => {
    t.is(m('unicorns'), 'unicorns & rainbows');
});
