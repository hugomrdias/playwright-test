/**
 * Reporter for real `node:test` that prints test results the way the parity
 * test in `test.js` reads them.
 *
 * @param {AsyncIterable<any>} source
 */
export default async function* reporter(source) {
  for await (const { type, data } of source) {
    if (type === 'test:pass' || type === 'test:fail') {
      if (data.details?.type === 'suite') {
        continue
      }
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
