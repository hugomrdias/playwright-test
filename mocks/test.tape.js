/* eslint-disable no-undef */
// eslint-disable-next-line strict
const test = require('tape');
const debug = require('debug');

const error = debug('app:error');

test('timing test', (t) => {
    t.equal(typeof Date.now, 'function');
    t.end();
});

test('controller exists', (t) => {
    error('testing debug');
    t.equal(typeof Date.now, 'function');
    t.end();
});

