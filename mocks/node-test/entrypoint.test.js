/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
// The package name, not a relative path, to test the exports in package.json
import test, { describe, exec, hold, it } from 'playwright-test/node-test'

console.log(`ORDER exec ${typeof exec} hold ${typeof hold}`)
describe('from the package entrypoint', () => {
  it('works', (t) => {
    t.assert.equal(1, 1)
  })
})
test('default export', () => {
  // noop
})
