/* eslint-disable no-undef */
// eslint-disable-next-line strict
const test = require('tape');
const debug = require('debug');

const error = debug('app:error');

test('timing test', (t) => {
    t.plan(2);

    t.equal(typeof Date.now, 'function');
});

test('controller exists', (t) => {
    t.plan(1);
    error('testing debug');
    t.ok(self.pwTestController);
});

