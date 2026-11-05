/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/** biome-ignore-all lint/complexity/noArguments: testing them */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: testing them */
/** biome-ignore-all lint/complexity/useLiteralKeys: testing them */
/** biome-ignore-all lint/suspicious/noThenProperty: testing them */
/** biome-ignore-all lint/style/useConsistentBuiltinInstantiation: testing them */
/** biome-ignore-all lint/correctness/noInvalidBuiltinInstantiation: testing them */
/** biome-ignore-all lint/complexity/noUselessConstructor: testing them */
/** biome-ignore-all lint/complexity/useRegexLiterals: testing them */
/** biome-ignore-all lint/suspicious/noSparseArray: testing them */
/** biome-ignore-all lint/suspicious/noGlobalIsNan: testing them */
/** biome-ignore-all lint/style/useThrowOnlyError: testing them */

/**
 * The same cases run against the real `node:assert` and `src/taps/node-assert.js`
 * to compare their results.
 */

class Foo {
  constructor() {
    this.a = 1
  }
}
class Bar {
  constructor() {
    this.a = 1
  }
}
const circ = () => {
  const o = { a: 1 }
  o.self = o
  return o
}
const sparse = () => {
  const x = [1]
  x[2] = 3
  return x
}
const boom = () => {
  throw new TypeError('boom')
}
const buf = (n) => new Uint8Array(n)
const url = (href) => new URL(href)

/**
 * Pairs that take a value from each side. Every one runs with `deepEqual`,
 * `notDeepEqual`, `deepStrictEqual`, `notDeepStrictEqual` and
 * `partialDeepStrictEqual`, as is and nested in an object, an array, a Map and a Set.
 *
 * @type {Array<[string, () => unknown, () => unknown]>}
 */
const PAIRS = [
  ['same object', () => ({ a: 1 }), () => ({ a: 1 })],
  ['diff object', () => ({ a: 1 }), () => ({ a: 2 })],
  ['extra key', () => ({ a: 1, b: 2 }), () => ({ a: 1 })],
  ['less keys', () => ({ a: 1 }), () => ({ a: 1, b: 2 })],
  ['loose value', () => ({ a: 1 }), () => ({ a: '1' })],
  ['key order', () => ({ a: 1, b: 2 }), () => ({ b: 2, a: 1 })],
  ['array', () => [1, 2], () => [1, 2]],
  ['array diff', () => [1, 2], () => [1, 3]],
  ['array subset', () => [1, 2, 3], () => [1, 3]],
  ['array length', () => [1], () => [1, 2]],
  ['array vs object', () => [1], () => ({ 0: 1 })],
  ['array props', () => Object.assign([1], { x: 1 }), () => [1]],
  [
    'array props same',
    () => Object.assign([1], { x: 1 }),
    () => Object.assign([1], { x: 1 }),
  ],
  ['sparse vs undefined', sparse, () => [1, undefined, 3]],
  ['sparse same', sparse, sparse],
  ['undefined prop', () => ({ a: undefined }), () => ({})],
  ['null vs undefined', () => [null], () => [undefined]],
  ['NaN', () => NaN, () => NaN],
  ['NaN prop', () => ({ a: NaN }), () => ({ a: NaN })],
  ['0 -0', () => 0, () => -0],
  ['0 -0 prop', () => ({ a: 0 }), () => ({ a: -0 })],
  ['1 "1"', () => 1, () => '1'],
  ['null undefined', () => null, () => undefined],
  ['true 1', () => true, () => 1],
  ['bigint', () => 1n, () => 1n],
  ['bigint vs number', () => 1n, () => 1],
  ['string', () => 'a', () => 'a'],
  ['string diff', () => 'a', () => 'b'],
  ['same symbol', () => Symbol.for('a'), () => Symbol.for('a')],
  ['diff symbol', () => Symbol('a'), () => Symbol('a')],
  ['prototype', () => new Foo(), () => ({ a: 1 })],
  ['classes', () => new Foo(), () => new Bar()],
  ['same class', () => new Foo(), () => new Foo()],
  ['null proto', () => Object.create(null), () => ({})],
  ['both null proto', () => Object.create(null), () => Object.create(null)],
  ['Date', () => new Date(0), () => new Date(0)],
  ['Date diff', () => new Date(0), () => new Date(1)],
  ['invalid Date', () => new Date(NaN), () => new Date(NaN)],
  ['invalid vs valid Date', () => new Date(NaN), () => new Date(0)],
  ['Date props', () => Object.assign(new Date(0), { a: 1 }), () => new Date(0)],
  ['Date vs object', () => new Date(0), () => ({})],
  ['RegExp', () => /a/g, () => /a/g],
  ['RegExp flags', () => /a/g, () => /a/i],
  ['RegExp source', () => /a/, () => /b/],
  ['RegExp lastIndex', () => Object.assign(/a/g, { lastIndex: 2 }), () => /a/g],
  ['RegExp vs object', () => /a/, () => ({})],
  ['Map', () => new Map([[1, 2]]), () => new Map([[1, 2]])],
  ['Map diff', () => new Map([[1, 2]]), () => new Map([[1, 3]])],
  ['Map keys', () => new Map([[1, 2]]), () => new Map([[2, 2]])],
  [
    'Map object keys',
    () => new Map([[{ x: 1 }, 2]]),
    () => new Map([[{ x: 1 }, 2]]),
  ],
  [
    'Map object keys diff',
    () => new Map([[{ x: 1 }, 2]]),
    () => new Map([[{ x: 2 }, 2]]),
  ],
  [
    'Map many object keys',
    () =>
      new Map([
        [{ x: 1 }, 1],
        [{ x: 2 }, 2],
        [{ x: 3 }, 3],
      ]),
    () =>
      new Map([
        [{ x: 3 }, 3],
        [{ x: 2 }, 2],
        [{ x: 1 }, 1],
      ]),
  ],
  ['Map loose keys', () => new Map([[1, 2]]), () => new Map([['1', 2]])],
  [
    'Map null key',
    () =>
      new Map([
        [null, 1],
        [{ a: 1 }, 1],
      ]),
    () =>
      new Map([
        [{ a: 1 }, 1],
        [null, 1],
      ]),
  ],
  [
    'Map size',
    () =>
      new Map([
        [1, 2],
        [2, 3],
      ]),
    () => new Map([[1, 2]]),
  ],
  ['Map vs object', () => new Map(), () => ({})],
  ['Set', () => new Set([1, 2]), () => new Set([2, 1])],
  ['Set diff', () => new Set([1]), () => new Set([2])],
  ['Set objects', () => new Set([{ x: 1 }]), () => new Set([{ x: 1 }])],
  ['Set objects diff', () => new Set([{ x: 1 }]), () => new Set([{ x: 2 }])],
  [
    'Set many objects',
    () => new Set([{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }]),
    () => new Set([{ x: 4 }, { x: 3 }, { x: 2 }, { x: 1 }]),
  ],
  ['Set loose', () => new Set([1, 2, 3]), () => new Set(['1', '2', '3'])],
  [
    'Set null',
    () => new Set([null, { a: 1 }, 2]),
    () => new Set([{ a: 1 }, null, 2]),
  ],
  ['Set size', () => new Set([1, 2]), () => new Set([1])],
  ['Set vs array', () => new Set([1]), () => [1]],
  [
    'symbol key',
    () => ({ [Symbol.for('s')]: 1 }),
    () => ({ [Symbol.for('s')]: 2 }),
  ],
  [
    'symbol key same',
    () => ({ [Symbol.for('s')]: 1 }),
    () => ({ [Symbol.for('s')]: 1 }),
  ],
  ['circular', circ, circ],
  ['circular vs plain', circ, () => ({ a: 1, self: { a: 1 } })],
  [
    'getter',
    () => ({
      get x() {
        return 1
      },
    }),
    () => ({ x: 1 }),
  ],
  [
    'non enumerable',
    () => Object.defineProperty({}, 'a', { value: 1 }),
    () => ({}),
  ],
  ['String object', () => new String('a'), () => new String('a')],
  ['String object diff', () => new String('a'), () => new String('b')],
  ['Number object', () => new Number(1), () => new Number(1)],
  ['Number object diff', () => new Number(1), () => new Number(2)],
  ['Number object NaN', () => new Number(NaN), () => new Number(NaN)],
  ['Number object -0', () => new Number(0), () => new Number(-0)],
  ['Boolean object', () => new Boolean(true), () => new Boolean(false)],
  ['BigInt object', () => Object(1n), () => Object(1n)],
  [
    'Symbol object',
    () => Object(Symbol.for('a')),
    () => Object(Symbol.for('a')),
  ],
  ['boxed vs primitive', () => new Number(1), () => 1],
  ['boxed vs object', () => new Number(1), () => ({})],
  ['boxed kinds', () => new Number(1), () => new String('1')],
  ['Uint8Array', () => buf(2), () => buf(2)],
  ['Uint8Array diff', () => new Uint8Array([1]), () => new Uint8Array([2])],
  [
    'Uint8Array subset',
    () => new Uint8Array([1, 2, 3]),
    () => new Uint8Array([1, 3]),
  ],
  ['typed kinds', () => new Uint8Array(1), () => new Int8Array(1)],
  [
    'Float32Array -0',
    () => new Float32Array([0]),
    () => new Float32Array([-0]),
  ],
  [
    'Float64Array NaN',
    () => new Float64Array([NaN]),
    () => new Float64Array([NaN]),
  ],
  ['typed props', () => Object.assign(buf(1), { a: 1 }), () => buf(1)],
  [
    'DataView',
    () => new DataView(new ArrayBuffer(1)),
    () => new DataView(new ArrayBuffer(1)),
  ],
  [
    'DataView diff',
    () => new DataView(new Uint8Array([1]).buffer),
    () => new DataView(new Uint8Array([2]).buffer),
  ],
  ['ArrayBuffer', () => new ArrayBuffer(2), () => new ArrayBuffer(2)],
  [
    'ArrayBuffer diff',
    () => new Uint8Array([1]).buffer,
    () => new Uint8Array([2]).buffer,
  ],
  [
    'ArrayBuffer subset',
    () => new Uint8Array([1, 2]).buffer,
    () => new Uint8Array([2]).buffer,
  ],
  ['ArrayBuffer vs view', () => new ArrayBuffer(1), () => buf(1)],
  ['Error', () => new Error('a'), () => new Error('a')],
  ['Error message', () => new Error('a'), () => new Error('b')],
  ['Error type', () => new Error('a'), () => new TypeError('a')],
  [
    'Error cause',
    () => new Error('a', { cause: 1 }),
    () => new Error('a', { cause: 2 }),
  ],
  [
    'Error cause missing',
    () => new Error('a', { cause: 1 }),
    () => new Error('a'),
  ],
  [
    'Error cause nested',
    () => new Error('a', { cause: new Error('x') }),
    () => new Error('a', { cause: new Error('y') }),
  ],
  [
    'Error props',
    () => Object.assign(new Error('a'), { code: 1 }),
    () => new Error('a'),
  ],
  ['Error vs object', () => new Error('a'), () => ({ message: 'a' })],
  ['object vs Error', () => ({}), () => new Error('a')],
  [
    'AggregateError',
    () => new AggregateError([new Error('a')], 'x'),
    () => new AggregateError([new Error('a')], 'x'),
  ],
  [
    'AggregateError diff',
    () => new AggregateError([new Error('a')], 'x'),
    () => new AggregateError([new Error('b')], 'x'),
  ],
  ['URL', () => url('http://a.com'), () => url('http://a.com')],
  ['URL diff', () => url('http://a.com'), () => url('http://b.com')],
  ['URL vs object', () => url('http://a.com'), () => ({})],
  [
    'URLSearchParams',
    () => new URLSearchParams('a=1'),
    () => new URLSearchParams('a=1'),
  ],
  ['WeakMap', () => new WeakMap(), () => new WeakMap()],
  ['WeakSet', () => new WeakSet(), () => new WeakSet()],
  ['Promise', () => Promise.resolve(1), () => Promise.resolve(1)],
  ['functions', () => () => {}, () => () => {}],
  ['same function', () => Foo, () => Foo],
  [
    'arguments',
    function () {
      return arguments
    },
    function () {
      return arguments
    },
  ],
  [
    'arguments vs array',
    function () {
      return arguments
    },
    () => [],
  ],
  [
    'toStringTag',
    () => ({ [Symbol.toStringTag]: 'a' }),
    () => ({ [Symbol.toStringTag]: 'b' }),
  ],
  ['toStringTag vs plain', () => ({ [Symbol.toStringTag]: 'a' }), () => ({})],
  [
    'class with own constructor',
    () => Object.assign(new Foo(), { constructor: 1 }),
    () => Object.assign(new Foo(), { constructor: 1 }),
  ],
]

const WRAPPERS = [
  ['', (v) => v],
  ['in object ', (v) => ({ v })],
  ['in array ', (v) => [v]],
  ['in Map ', (v) => new Map([['k', v]])],
  ['in Set ', (v) => new Set([v])],
]

const DEEP = [
  'deepEqual',
  'notDeepEqual',
  'deepStrictEqual',
  'notDeepStrictEqual',
  'partialDeepStrictEqual',
]

/**
 * @type {Array<[string, (a: any) => unknown]>}
 */
const CASES = [
  ['ok(1)', (a) => a.ok(1)],
  ['ok(0)', (a) => a.ok(0)],
  ['ok()', (a) => a.ok()],
  ['ok(0,msg)', (a) => a.ok(0, 'm')],
  ['ok(0,Error)', (a) => a.ok(0, new RangeError('x'))],
  ['assert(0)', (a) => a(0)],
  ['assert(1)', (a) => a(1)],
  ['assert()', (a) => a()],
  ['equal 1,1', (a) => a.equal(1, 1)],
  ["equal 1,'1'", (a) => a.equal(1, '1')],
  ['equal NaN,NaN', (a) => a.equal(NaN, NaN)],
  ['equal 0,-0', (a) => a.equal(0, -0)],
  ['equal null,undefined', (a) => a.equal(null, undefined)],
  ['equal msg string', (a) => a.equal(1, 2, 'custom')],
  ['equal msg Error', (a) => a.equal(1, 2, new RangeError('x'))],
  ['equal missing args', (a) => a.equal(1)],
  ['notEqual 1,2', (a) => a.notEqual(1, 2)],
  ['notEqual 1,1', (a) => a.notEqual(1, 1)],
  ['notEqual NaN,NaN', (a) => a.notEqual(NaN, NaN)],
  ["notEqual 1,'1'", (a) => a.notEqual(1, '1')],
  ['notEqual missing args', (a) => a.notEqual()],
  ['strictEqual 1,1', (a) => a.strictEqual(1, 1)],
  ["strictEqual 1,'1'", (a) => a.strictEqual(1, '1')],
  ['strictEqual NaN,NaN', (a) => a.strictEqual(NaN, NaN)],
  ['strictEqual 0,-0', (a) => a.strictEqual(0, -0)],
  ['strictEqual msg', (a) => a.strictEqual(1, 2, 'custom')],
  ['strictEqual missing args', (a) => a.strictEqual(1)],
  ['notStrictEqual 1,2', (a) => a.notStrictEqual(1, 2)],
  ['notStrictEqual 1,1', (a) => a.notStrictEqual(1, 1)],
  ['notStrictEqual missing args', (a) => a.notStrictEqual(1)],
  ['deepEqual msg', (a) => a.deepEqual({ a: 1 }, { a: 2 }, 'custom')],
  [
    'deepEqual msg Error',
    (a) => a.deepEqual({ a: 1 }, { a: 2 }, new RangeError('x')),
  ],
  ['deepEqual missing args', (a) => a.deepEqual(1)],
  ['notDeepEqual msg', (a) => a.notDeepEqual({ a: 1 }, { a: 1 }, 'custom')],
  ['notDeepEqual missing args', (a) => a.notDeepEqual(1)],
  ['deepStrictEqual msg', (a) => a.deepStrictEqual(1, 2, 'custom')],
  ['deepStrictEqual missing args', (a) => a.deepStrictEqual(1)],
  ['notDeepStrictEqual missing args', (a) => a.notDeepStrictEqual(1)],
  [
    'partialDeepStrictEqual msg',
    (a) => a.partialDeepStrictEqual({ a: 1 }, { a: 2 }, 'custom'),
  ],
  ['partialDeepStrictEqual missing args', (a) => a.partialDeepStrictEqual(1)],
  ['throws', (a) => a.throws(boom)],
  ['throws no throw', (a) => a.throws(() => {})],
  ['throws class ok', (a) => a.throws(boom, TypeError)],
  ['throws class wrong', (a) => a.throws(boom, RangeError)],
  ['throws class wrong msg', (a) => a.throws(boom, RangeError, 'custom')],
  ['throws regex ok', (a) => a.throws(boom, /boom/)],
  ['throws regex wrong', (a) => a.throws(boom, /nope/)],
  ['throws regex wrong msg', (a) => a.throws(boom, /nope/, 'custom')],
  [
    'throws object ok',
    (a) => a.throws(boom, { name: 'TypeError', message: 'boom' }),
  ],
  ['throws object wrong', (a) => a.throws(boom, { message: 'x' })],
  [
    'throws object wrong msg',
    (a) => a.throws(boom, { message: 'x' }, 'custom'),
  ],
  ['throws object regex', (a) => a.throws(boom, { message: /bo/ })],
  ['throws object regex wrong', (a) => a.throws(boom, { message: /nope/ })],
  ['throws object missing key', (a) => a.throws(boom, { foo: 1 })],
  ['throws empty object', (a) => a.throws(boom, {})],
  [
    'throws primitive actual',
    (a) =>
      a.throws(
        () => {
          throw 'x'
        },
        { message: 'x' }
      ),
  ],
  ['throws validate fn', (a) => a.throws(boom, (e) => e instanceof TypeError)],
  ['throws validate false', (a) => a.throws(boom, () => false)],
  ['throws validate truthy', (a) => a.throws(boom, () => 1)],
  [
    'throws validate throws',
    (a) =>
      a.throws(boom, () => {
        throw new RangeError('v')
      }),
  ],
  ['throws error instance', (a) => a.throws(boom, new TypeError('boom'))],
  ['throws error instance diff', (a) => a.throws(boom, new TypeError('other'))],
  ['throws not a function', (a) => a.throws('x')],
  ['throws string as msg', (a) => a.throws(() => {}, 'custom')],
  ['throws msg equals error', (a) => a.throws(boom, 'boom')],
  ['throws two strings', (a) => a.throws(boom, 'a', 'b')],
  ['throws number as error', (a) => a.throws(boom, 1)],
  ['throws no throw class', (a) => a.throws(() => {}, TypeError)],
  ['doesNotThrow ok', (a) => a.doesNotThrow(() => {})],
  ['doesNotThrow throws', (a) => a.doesNotThrow(boom)],
  ['doesNotThrow msg', (a) => a.doesNotThrow(boom, 'custom')],
  ['doesNotThrow class other', (a) => a.doesNotThrow(boom, RangeError)],
  ['doesNotThrow class same', (a) => a.doesNotThrow(boom, TypeError)],
  ['doesNotThrow regex', (a) => a.doesNotThrow(boom, /boom/)],
  ['doesNotThrow regex other', (a) => a.doesNotThrow(boom, /nope/)],
  ['doesNotThrow bad expected', (a) => a.doesNotThrow(boom, {})],
  ['doesNotThrow not a function', (a) => a.doesNotThrow(1)],
  ['rejects promise', (a) => a.rejects(Promise.reject(new TypeError('x')))],
  ['rejects fn', (a) => a.rejects(async () => boom())],
  ['rejects resolves', (a) => a.rejects(Promise.resolve(1))],
  [
    'rejects validate',
    (a) => a.rejects(Promise.reject(new TypeError('x')), TypeError),
  ],
  [
    'rejects validate wrong',
    (a) => a.rejects(Promise.reject(new TypeError('x')), RangeError),
  ],
  [
    'rejects regex wrong',
    (a) => a.rejects(Promise.reject(new TypeError('x')), /nope/),
  ],
  [
    'rejects validate false',
    (a) => a.rejects(Promise.reject(new TypeError('x')), () => false),
  ],
  [
    'rejects object',
    (a) => a.rejects(Promise.reject(new TypeError('x')), { message: 'x' }),
  ],
  [
    'rejects object wrong',
    (a) => a.rejects(Promise.reject(new TypeError('x')), { message: 'y' }),
  ],
  ['rejects not promise', (a) => a.rejects(1)],
  ['rejects fn not promise', (a) => a.rejects(() => 1)],
  ['rejects sync throw fn', (a) => a.rejects(boom)],
  [
    'rejects thenable',
    (a) => a.rejects({ then: (_r, j) => j(new Error('x')), catch() {} }),
  ],
  ['rejects msg', (a) => a.rejects(Promise.resolve(1), 'custom')],
  ['doesNotReject ok', (a) => a.doesNotReject(Promise.resolve(1))],
  [
    'doesNotReject rejects',
    (a) => a.doesNotReject(Promise.reject(new Error('x'))),
  ],
  ['doesNotReject fn', (a) => a.doesNotReject(async () => 1)],
  ['doesNotReject not promise', (a) => a.doesNotReject(1)],
  [
    'doesNotReject class other',
    (a) => a.doesNotReject(Promise.reject(new TypeError('x')), RangeError),
  ],
  ['match ok', (a) => a.match('abc', /b/)],
  ['match no', (a) => a.match('abc', /x/)],
  ['match non string', (a) => a.match(1, /1/)],
  ['match bad regexp', (a) => a.match('a', 'a')],
  ['match msg', (a) => a.match('abc', /x/, 'custom')],
  ['match msg Error', (a) => a.match('abc', /x/, new RangeError('x'))],
  ['doesNotMatch ok', (a) => a.doesNotMatch('abc', /x/)],
  ['doesNotMatch no', (a) => a.doesNotMatch('abc', /b/)],
  ['doesNotMatch non string', (a) => a.doesNotMatch(1, /x/)],
  ['doesNotMatch bad regexp', (a) => a.doesNotMatch('a', 'a')],
  ['ifError null', (a) => a.ifError(null)],
  ['ifError undefined', (a) => a.ifError(undefined)],
  ['ifError 0', (a) => a.ifError(0)],
  ['ifError Error', (a) => a.ifError(new TypeError('x'))],
  ['ifError empty Error', (a) => a.ifError(new TypeError())],
  ['fail default', (a) => a.fail()],
  ['fail msg', (a) => a.fail('m')],
  ['fail Error', (a) => a.fail(new RangeError('x'))],
  [
    'AssertionError construct',
    (a) => {
      const e = new a.AssertionError({ actual: 1, expected: 2, operator: 'x' })
      if (
        e.code !== 'ERR_ASSERTION' ||
        e.name !== 'AssertionError' ||
        !(e instanceof Error)
      ) {
        throw new Error('code')
      }
      if (
        e.actual !== 1 ||
        e.expected !== 2 ||
        e.operator !== 'x' ||
        e.generatedMessage !== true
      ) {
        throw new Error('properties')
      }
    },
  ],
  [
    'AssertionError message',
    (a) => {
      const e = new a.AssertionError({ message: 'm' })
      if (e.message !== 'm' || e.generatedMessage !== false) {
        throw new Error('message')
      }
    },
  ],
  ['AssertionError no options', (a) => new a.AssertionError()],
  ['Assert strict by default', (a) => new a.Assert().equal(1, '1')],
  ['Assert not strict', (a) => new a.Assert({ strict: false }).equal(1, '1')],
  [
    'Assert skipPrototype',
    (a) =>
      new a.Assert({ skipPrototype: true }).deepStrictEqual(
        new Foo(),
        new Bar()
      ),
  ],
  [
    'Assert prototype',
    (a) => new a.Assert().deepStrictEqual(new Foo(), new Bar()),
  ],
  ['Assert bad diff', (a) => new a.Assert({ diff: 'x' })],
  ['Assert without new', (a) => a.Assert()],
  [
    'Assert methods',
    (a) => {
      const instance = new a.Assert()
      instance.ok(1)
      instance.throws(boom)
      instance.deepEqual({ a: 1 }, { a: 1 })
    },
  ],
]

for (const [label, left, right] of PAIRS) {
  for (const [prefix, wrap] of WRAPPERS) {
    for (const method of DEEP) {
      CASES.push([
        `${method} ${prefix}${label}`,
        (a) => a[method](wrap(left()), wrap(right())),
      ])
    }
  }
}

/**
 * @param {any} assert
 * @param {string} face
 */
async function runFace(assert, face) {
  for (const [label, fn] of CASES) {
    const result = {}
    try {
      await fn(assert)
      result.verdict = 'pass'
    } catch (err) {
      result.verdict = 'throw'
      result.name = err.name
      result.code = err.code
      result.operator = err.operator
      result.generatedMessage = err.generatedMessage
    }
    console.log(`CASE ${face} ${label} ${JSON.stringify(result)}`)
  }
}

/**
 * @param {any} legacy - the shape of `node:assert`
 */
export async function run(legacy) {
  await runFace(legacy, 'legacy')
  await runFace(legacy.strict, 'strict')
  console.log('CASES DONE')
}
