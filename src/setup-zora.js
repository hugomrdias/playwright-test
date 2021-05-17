import { createHarness } from 'zora'

export const harness = createHarness({
  // eslint-disable-next-line no-undef
  indent: process.env.INDENT === 'true',
  // eslint-disable-next-line no-undef
  runOnly: process.env.RUN_ONLY === 'true',
})

// @ts-ignore
self.zora = harness

export default harness
export const test = harness.test
export const only = harness.only
export const skip = harness.skip
export const equal = harness.equal
export const equals = harness.equals
export const eq = harness.eq
export const deepEqual = harness.deepEqual
export const notEqual = harness.notEqual
export const notEquals = harness.notEquals
export const notEq = harness.notEq
export const notDeepEqual = harness.notDeepEqual
export const is = harness.is
export const same = harness.same
export const isNot = harness.isNot
export const notSame = harness.notSame
export const ok = harness.ok
export const truthy = harness.truthy
export const notOk = harness.notOk
export const falsy = harness.falsy
export const fail = harness.fail
export const throws = harness.throws
export const doesNotThrow = harness.doesNotThrow
