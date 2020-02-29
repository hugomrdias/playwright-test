/* eslint-disable no-undef */
// eslint-disable-next-line strict
const test = require('tape');

test('timing test 2', (t) => {
    t.plan(2);

    t.equal(typeof Date.now, 'function');
    const start = Date.now();

    setTimeout(() => {
        t.equal(Date.now() - start, 100);
    }, 100);
});
