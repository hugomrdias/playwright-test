'use strict';

const test = require('ava');
const m = require('.');

test('title', (t) => {
    const err = t.throws(() => {
        m(123);
    }, TypeError);

    t.is(err.message, 'Expected a string, got number');

    t.is(m('unicorns'), 'unicorns & rainbows');
});
