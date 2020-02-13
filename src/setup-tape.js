'use strict';

const test = require('tape');

const isWorker = process.env.TAPE_IS_WORKER;

test.onFailure(() => {
    self.testsFailed = 1;
});

test.onFinish(() => {
    if (isWorker) {
        postMessage(self.testsFailed);
    } else {
        window.testsEnded = true;
    }
});

