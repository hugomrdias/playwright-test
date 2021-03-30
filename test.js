'use strict';

const { test } = require('uvu');
const assert = require('uvu/assert');
const execa = require('execa');

test('mocha', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js']);

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('5 passing'), 'process stdout');
});

test('mocha with DEBUG=app', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js'], { env: { DEBUG: 'app' } });

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('5 passing'), 'process stdout');
    assert.ok(proc.stdout.includes('app test pass'), 'debug output');
});

test('mocha incognito', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--incognito']);

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('5 passing'), 'process stdout');
});

test('mocha mode:worker', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--mode', 'worker']);

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('5 passing'), 'process stdout');
});

test('mocha extension', async () => {
    const proc = await execa('./cli.js', ['mocks/test.mocha.js', '--extension']);

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('5 passing'), 'process stdout');
});

test('tape', async () => {
    const proc = await execa('./cli.js', ['mocks/test.tape.js', '--runner', 'tape']);

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('# pass  2'), 'process stdout');
});

test('tape mode:worker', async () => {
    const proc = await execa('./cli.js', ['mocks/test.tape.js', '--runner', 'tape', '--mode', 'worker']);

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('# pass  2'), 'process stdout');
});

test('zora', async () => {
    const proc = await execa('./cli.js', ['mocks/*.zora.js', '--runner', 'zora'], {
        env: {
            'RUN_ONLY': true,
            'INDENT': true
        }
    });

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('# success: 2'), 'process stdout');
});

test('zora mode:worker', async () => {
    const proc = await execa('./cli.js', ['mocks/*.zora.js', '--runner', 'zora', '--mode', 'worker'], {
        env: {
            'RUN_ONLY': true,
            'INDENT': true
        }
    });

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('# success: 2'), 'process stdout');
});

test.skip('benchmark', async () => {
    const proc = await execa('./cli.js', ['mocks/benchmark.js', '--runner', 'benchmark']);

    assert.is(proc.exitCode, 0, 'exit code');
    assert.ok(proc.stdout.includes('Fastest is String#indexOf'), 'process stdout');
});
test.run();
