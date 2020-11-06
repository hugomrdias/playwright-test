/* eslint-disable no-undef */
// eslint-disable-next-line strict
const assert = require('assert');
const debug = require('debug')('app');

describe('Array', () => {
    describe('#indexOf()', () => {
        it('should return -1 when the value is not present', () => {
            assert.equal([1, 2, 3].indexOf(4), -1);
        });

        it('should fail  ', () => {
            // console.log(chrome);
            assert.equal([1, 2, 3].indexOf(2), 1);
        });

        it('should pass with debug', () => {
            assert.equal([1, 2, 3].indexOf(4), -1);
            debug('test pass');
        });
    });
});
