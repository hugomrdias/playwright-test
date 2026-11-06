/**
 * Reporter for real `node:test` that prints test results the way the parity
 * test in `tests/node-test.test.js` reads them.
 *
 * @param {AsyncIterable<any>} source
 */
export default async function* reporter(source) {
  for await (const { type, data } of source) {
    if (type === 'test:summary') {
      yield `SUMMARY ${JSON.stringify(data.counts)}\n`
    }
    if (type === 'test:pass' || type === 'test:fail') {
      const outcome =
        data.skip === undefined
          ? data.todo === undefined
            ? type === 'test:pass'
              ? 'pass'
              : 'fail'
            : 'todo'
          : 'skip'
      yield `RESULT ${outcome} ${data.name}\n`
    }
  }
}
