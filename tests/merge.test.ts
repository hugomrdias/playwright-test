import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
  throws,
} from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMerge, isPlainObject } from '../src/utils/merge.ts'

const merge = createMerge()
const ignoreUndefined = createMerge({ ignoreUndefined: true })
const concatArrays = createMerge({ concatArrays: true })
const both = createMerge({ ignoreUndefined: true, concatArrays: true })

describe('merge', () => {
  it('deep merges plain objects, later ones win', () => {
    equal(merge({ a: 1, b: { c: 1, d: 1 } }, { b: { d: 2, e: 2 } }, { f: 3 }), {
      a: 1,
      b: { c: 1, d: 2, e: 2 },
      f: 3,
    })
  })

  it('returns a new object and never changes its arguments', () => {
    const first = { a: { b: [1] } }
    const second = { a: { b: [2] } }
    const result = both(first, second)

    equal(result, { a: { b: [1, 2] } })
    equal(first, { a: { b: [1] } })
    equal(second, { a: { b: [2] } })
    ok(result.a !== first.a)
    equal(merge(), {})
    const one = merge({ a: 1 })
    const two = merge({ a: 1 })
    ok(one !== two, 'two calls share the result')
  })

  it('skips undefined arguments', () => {
    equal(merge(undefined, { a: 1 }, undefined), { a: 1 })
  })

  it('throws for arguments that are not plain objects', () => {
    for (const value of [null, 1, 'a', [1], new Date(0), () => 1]) {
      throws(() => merge(value), TypeError, String(value))
    }
  })

  it('sets undefined values unless ignoreUndefined', () => {
    const result = merge({ a: 1 }, { a: undefined })
    ok(Object.hasOwn(result, 'a'))
    is(result.a, undefined)
    equal(
      ignoreUndefined(
        { a: 1, b: { c: 1 } },
        { a: undefined, b: { c: undefined } }
      ),
      {
        a: 1,
        b: { c: 1 },
      }
    )
  })

  it('replaces arrays unless concatArrays', () => {
    equal(merge({ a: [1, 2] }, { a: [3] }), { a: [3] })
    equal(concatArrays({ a: [1, 2] }, { a: [3] }, { a: [4] }), {
      a: [1, 2, 3, 4],
    })
  })

  it('drops the holes of sparse arrays when concatenating, keeps them when copying', () => {
    // biome-ignore lint/suspicious/noSparseArray: the case under test
    const sparse = [1, , 3]
    const result = concatArrays<{ a: unknown[] }>(
      // biome-ignore lint/suspicious/noSparseArray: the case under test
      { a: [0, , 2] },
      { a: sparse }
    )
    equal(result.a, [0, 2, 1, 3])
    ok(result.a.every((value: unknown) => value !== undefined))

    const copy = merge<{ a: unknown[] }>({ a: sparse }).a
    is(copy.length, 3)
    ok(!Object.hasOwn(copy, 1))
  })

  it('replaces a value of another kind', () => {
    equal(concatArrays({ a: [1] }, { a: { b: 1 } }), { a: { b: 1 } })
    equal(concatArrays({ a: { b: 1 } }, { a: [1] }), { a: [1] })
    equal(merge({ a: { b: 1 } }, { a: null }), { a: null })
    equal(merge({ a: 1 }, { a: { b: 1 } }), { a: { b: 1 } })
  })

  it('copies arrays and plain objects, shares everything else', () => {
    class Plugin {
      name = 'plugin'
    }
    const plugin = new Plugin()
    const fn = () => 1
    const nested = { x: [{ y: 1 }] }
    const result = concatArrays<{
      plugins: Plugin[]
      fn: () => number
      nested: typeof nested
    }>({ plugins: [plugin] }, { fn, nested })

    is(result.plugins[0], plugin)
    is(result.fn, fn)
    equal(result.nested, nested)
    ok(result.nested !== nested)
    ok(result.nested.x[0] !== nested.x[0])
  })

  it('does not merge into class instances, they get replaced', () => {
    class Options {
      a = 1
    }
    const instance = new Options()
    const result = merge({ o: instance }, { o: { b: 2 } })
    equal(result.o, { b: 2 })
    is(instance.a, 1)
  })

  it('keeps objects without a prototype', () => {
    const bare = Object.assign(Object.create(null), { x: 1 })
    const result = merge<{ bare: object }>({ bare }, { bare: { y: 2 } })
    is(Object.getPrototypeOf(result.bare), null)
    equal({ ...result.bare }, { x: 1, y: 2 })
  })

  it('merges symbol keys', () => {
    const key = Symbol('key')
    equal(merge({ [key]: { a: 1 } }, { [key]: { b: 2 } }), {
      [key]: { a: 1, b: 2 },
    })
  })

  it('keeps __proto__ as a key without changing prototypes', () => {
    const result = merge(JSON.parse('{"__proto__": {"polluted": true}}'))
    is(Object.getPrototypeOf(result), Object.prototype)
    ok(Object.hasOwn(result, '__proto__'))
    is(({} as Record<string, unknown>).polluted, undefined)
  })

  it('does not merge into inherited properties', () => {
    equal(merge({}, { toString: { a: 1 } }), { toString: { a: 1 } })
  })
})

describe('isPlainObject', () => {
  it('is true for object literals and objects without a prototype', () => {
    ok(isPlainObject({}))
    ok(isPlainObject(Object.create(null)))
  })

  it('is false for anything else', () => {
    for (const value of [
      null,
      undefined,
      1,
      'a',
      [],
      new Date(0),
      /x/,
      () => 1,
      new (class {})(),
      new Map(),
      Object.create({}),
    ]) {
      ok(!isPlainObject(value), String(value))
    }
  })
})
