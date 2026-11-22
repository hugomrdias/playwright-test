import { strict as assert } from 'assert'
import { test } from '../../src/node/test.js'
import { exec, hold } from '../../src/node/test-harness.js'

hold()
test('initial', () => {
  // noop
})
await exec()

assert.throws(
  () =>
    test('late', () => {
      // noop
    }),
  (/** @type {unknown} */ err) => {
    assert.ok(err instanceof Error)
    assert.match(
      err.message,
      /Test "late" was created after the tests finished running\./
    )
    assert.doesNotMatch(err.message, /\bhold\(\)|\bexec\(\)/)
    return true
  }
)
