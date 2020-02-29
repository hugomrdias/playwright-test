'use strict';

const test = require('tape');

self.TAPE_RUN_FAIL = false;

test.onFailure(() => {
    self.TAPE_RUN_FAIL = true;
});

test.onFinish(() => {
    if (process.env.PW_TEST.mode === 'worker') {
        postMessage({
            'pwRunEnded': true,
            'pwRunFailed':  self.TAPE_RUN_FAIL
        });
    } else {
        self.pwTestController.end(self.TAPE_RUN_FAIL);
    }
});
