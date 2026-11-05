import { strict as assert } from 'assert'
import { mock, run, snapshot, test } from '../../src/taps/node-test.js'

/**
 * @param {() => unknown} fn
 * @param {string} feature
 */
function unsupported(fn, feature) {
  assert.throws(fn, {
    message: `node:test ${feature} is not supported by playwright-test/taps/node-test`,
  })
}

test('throws for what is not implemented', (t) => {
  unsupported(() => mock.timers, 'mock.timers')
  unsupported(() => t.mock.timers, 'mock.timers')
  unsupported(() => mock.module('foo', {}), 'mock.module()')
  unsupported(() => t.mock.module('foo', {}), 'mock.module()')
  unsupported(() => run(), 'run()')
  unsupported(() => test.run(), 'run()')
  unsupported(
    () => snapshot.setDefaultSnapshotSerializers([]),
    'snapshot.setDefaultSnapshotSerializers()'
  )
  unsupported(
    () => snapshot.setResolveSnapshotPath(() => ''),
    'snapshot.setResolveSnapshotPath()'
  )
  unsupported(() => t.assert.snapshot('a'), 't.assert.snapshot()')
  unsupported(() => t.assert.fileSnapshot('a', 'b'), 't.assert.fileSnapshot()')
  unsupported(() => test.expectFailure('a'), 'test.expectFailure()')
  unsupported(() => test('a', { expectFailure: true }), 'options.expectFailure')
})
