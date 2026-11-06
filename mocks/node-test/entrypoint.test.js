/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
// The package name, not a relative path, to test the exports in package.json
import * as api from 'playwright-test/node-test'
import test, { describe, it } from 'playwright-test/node-test'

const internal = ['configure', 'exec', 'hold'].filter((name) => name in api)
console.log(`ORDER internal exports: ${internal.length}`)
describe('from the package entrypoint', () => {
  it('works', (t) => {
    t.assert.equal(1, 1)
  })
})
test('default export', () => {
  // noop
})
