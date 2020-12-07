/* eslint-disable no-empty-function */
'use strict';

const { test } = require('uvu');
const delay = require('delay');
const assert = require('uvu/assert');

test('sum', () => {
    assert.type(() => {}, 'function');
    assert.is(3, 3);
});

test('sum', async () => {
    await delay(2000);
    assert.type(() => {}, 'function');
    assert.is(3, 3);
});
test.run();
