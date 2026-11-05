/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
/** biome-ignore-all lint/suspicious/useAwait: testing them */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: testing them */
/** biome-ignore-all lint/style/useConsistentBuiltinInstantiation: testing them */
/** biome-ignore-all lint/correctness/noInvalidBuiltinInstantiation: testing them */
/** biome-ignore-all lint/complexity/noArguments: testing them */
/** biome-ignore-all lint/suspicious/noThenProperty: testing them */

/**
 * The same cases run against the real `node:util` and `src/polyfills/util.js` to
 * compare their results.
 */

class UtilFoo {
  constructor() {
    this.a = 1
  }
  get b() {
    return 2
  }
}
class UtilBar extends UtilFoo {}

/** @type {Array<[string, () => unknown]>} */
const VALUES = [
  ['undefined', () => undefined],
  ['null', () => null],
  ['true', () => true],
  ['zero', () => 0],
  ['minus zero', () => -0],
  ['NaN', () => NaN],
  ['big number', () => 1234567.891],
  ['bigint', () => 12n],
  ['string', () => "it's"],
  ['symbol', () => Symbol('s')],
  ['object', () => ({ a: 1, b: { c: { d: { e: 1 } } } })],
  [
    'long object',
    () =>
      Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`key${i}`, i])),
  ],
  ['null proto', () => Object.assign(Object.create(null), { a: 1 })],
  ['symbol key', () => ({ [Symbol.for('s')]: 1 })],
  [
    'getter',
    () => ({
      get a() {
        return 1
      },
      set b(_v) {},
    }),
  ],
  ['class', () => new UtilFoo()],
  ['subclass', () => new UtilBar()],
  ['class itself', () => UtilFoo],
  ['subclass itself', () => UtilBar],
  ['function', () => function named() {}],
  ['arrow', () => () => {}],
  ['async function', () => async function a() {}],
  ['generator function', () => function* g() {}],
  ['async generator function', () => async function* g() {}],
  ['function props', () => Object.assign(function f() {}, { a: 1 })],
  ['array', () => [1, 'a', [2, [3, [4, [5]]]]]],
  ['long array', () => Array.from({ length: 150 }, (_, i) => i)],
  [
    'sparse',
    () => {
      const x = [1]
      x[3] = 2
      return x
    },
  ],
  ['array props', () => Object.assign([1], { a: 1 })],
  [
    'arguments',
    function () {
      return arguments
    },
  ],
  [
    'Map',
    () =>
      new Map([
        [1, { a: 1 }],
        ['k', new Map()],
      ]),
  ],
  ['Set', () => new Set([1, 'a', { b: 1 }])],
  ['WeakMap', () => new WeakMap()],
  ['WeakSet', () => new WeakSet()],
  ['Date', () => new Date(0)],
  ['invalid Date', () => new Date(NaN)],
  ['RegExp', () => /a/gi],
  ['ArrayBuffer', () => new Uint8Array([1, 2]).buffer],
  ['DataView', () => new DataView(new ArrayBuffer(1))],
  ['Uint8Array', () => new Uint8Array([1, 2])],
  ['Int8Array', () => new Int8Array(1)],
  ['Uint8ClampedArray', () => new Uint8ClampedArray(1)],
  ['Int16Array', () => new Int16Array(1)],
  ['Uint16Array', () => new Uint16Array(1)],
  ['Int32Array', () => new Int32Array(1)],
  ['Uint32Array', () => new Uint32Array(1)],
  ['Float32Array', () => new Float32Array([1.5])],
  ['Float64Array', () => new Float64Array(1)],
  ['BigInt64Array', () => new BigInt64Array(1)],
  ['BigUint64Array', () => new BigUint64Array(1)],
  ['Number object', () => new Number(1)],
  ['String object', () => new String('a')],
  ['Boolean object', () => new Boolean(true)],
  ['BigInt object', () => Object(1n)],
  ['Symbol object', () => Object(Symbol.for('a'))],
  [
    'circular',
    () => {
      const o = { a: 1 }
      o.self = o
      return o
    },
  ],
  ['toStringTag', () => ({ [Symbol.toStringTag]: 'T' })],
  [
    'custom inspect',
    () => ({ [Symbol.for('nodejs.util.inspect.custom')]: () => 'custom!' }),
  ],
  ['generator', () => (function* g() {})()],
  ['thenable', () => ({ then() {} })],
]

const INSPECT_OPTIONS = [
  ['default', undefined],
  ['depth 0', { depth: 0 }],
  ['depth null', { depth: null }],
  ['colors', { colors: true }],
  ['compact false', { compact: false }],
  ['compact 1', { compact: 1 }],
  ['breakLength', { breakLength: 20 }],
  ['sorted', { sorted: true }],
  ['getters', { getters: true }],
  ['no custom', { customInspect: false }],
  ['maxArrayLength', { maxArrayLength: 2 }],
  ['maxStringLength', { maxStringLength: 2 }],
  ['numericSeparator', { numericSeparator: true }],
]

const TYPE_CHECKS = [
  'isAnyArrayBuffer',
  'isArgumentsObject',
  'isArrayBuffer',
  'isArrayBufferView',
  'isAsyncFunction',
  'isBigInt64Array',
  'isBigIntObject',
  'isBigUint64Array',
  'isBooleanObject',
  'isBoxedPrimitive',
  'isDataView',
  'isDate',
  'isFloat32Array',
  'isFloat64Array',
  'isGeneratorFunction',
  'isGeneratorObject',
  'isInt16Array',
  'isInt32Array',
  'isInt8Array',
  'isMap',
  'isMapIterator',
  'isModuleNamespaceObject',
  'isNativeError',
  'isNumberObject',
  'isPromise',
  'isRegExp',
  'isSet',
  'isSetIterator',
  'isSharedArrayBuffer',
  'isStringObject',
  'isSymbolObject',
  'isTypedArray',
  'isUint16Array',
  'isUint32Array',
  'isUint8Array',
  'isUint8ClampedArray',
  'isWeakMap',
  'isWeakSet',
]

const callback = (fn) =>
  new Promise((resolve) => {
    fn((err, value) =>
      resolve([
        err instanceof Error
          ? {
              string: String(err),
              name: err.name,
              code: err.code,
              message: err.message,
              // JSON can't tell these apart otherwise
              reason: String(err.reason),
              keys: Object.keys(err),
            }
          : err,
        value,
      ])
    )
  })

/** @type {Array<[string, (u: any) => unknown]>} */
const CASES = [
  ['format %s', (u) => u.format('%s %s', 'a', 1, 'extra')],
  ['format %s object', (u) => u.format('%s', { a: 1 })],
  ['format %s bigint', (u) => u.format('%s', 1n)],
  ['format %s symbol', (u) => u.format('%s', Symbol('a'))],
  ['format %s -0', (u) => u.format('%s', -0)],
  ['format %d', (u) => u.format('%d %d %d', 1.5, '2', 'x')],
  ['format %i', (u) => u.format('%i %i', 1.5, 'x')],
  ['format %f', (u) => u.format('%f', '1.5')],
  ['format %j', (u) => u.format('%j', { a: 1 })],
  [
    'format %j circular',
    (u) => {
      const o = {}
      o.o = o
      return u.format('%j', o)
    },
  ],
  ['format %o', (u) => u.format('%o', { a: [1] })],
  ['format %O', (u) => u.format('%O', { a: [1] })],
  ['format %c', (u) => u.format('%cstyled', 'color: red')],
  ['format %%', (u) => u.format('100%% %s', 'a')],
  ['format no args', (u) => u.format()],
  ['format not a string', (u) => u.format(1, { a: 1 }, 'b')],
  ['format missing', (u) => u.format('%s %s', 'a')],
  [
    'formatWithOptions',
    (u) => u.formatWithOptions({ colors: true }, '%O', { a: 1 }),
  ],
  [
    'inspect legacy args',
    (u) => u.inspect({ a: { b: { c: 1 } } }, false, 0, true),
  ],
  ['inspect bad options', (u) => u.inspect({}, 'x')],
  [
    'inspect.custom',
    (u) => u.inspect.custom === Symbol.for('nodejs.util.inspect.custom'),
  ],
  ['inspect.colors', (u) => Object.keys(u.inspect.colors).length > 0],
  ['inspect.styles', (u) => u.inspect.styles.string],
  [
    'inspect.defaultOptions',
    (u) => Object.keys(u.inspect.defaultOptions).sort().join(),
  ],
  [
    'stripVTControlCharacters',
    (u) => u.stripVTControlCharacters('\u001B[31ma\u001B[39m'),
  ],
  [
    'isDeepStrictEqual same',
    (u) => u.isDeepStrictEqual({ a: [1] }, { a: [1] }),
  ],
  ['isDeepStrictEqual diff', (u) => u.isDeepStrictEqual({ a: 1 }, { a: '1' })],
  [
    'inherits',
    (u) => {
      function A() {}
      function B() {}
      u.inherits(A, B)
      return [A.super_ === B, new A() instanceof B]
    },
  ],
  ['promisify', (u) => u.promisify((a, cb) => cb(null, a + 1))(1)],
  ['promisify rejects', (u) => u.promisify((cb) => cb(new RangeError('x')))()],
  ['promisify not a function', (u) => u.promisify('x')],
  [
    'promisify.custom',
    (u) => {
      const fn = () => {}
      const custom = () => 'custom'
      fn[u.promisify.custom] = custom
      return u.promisify(fn) === custom
    },
  ],
  [
    'promisify keeps props',
    (u) => {
      const fn = Object.assign((cb) => cb(), { a: 1 })
      const p = u.promisify(fn)
      return [p.a, p.name, p[u.promisify.custom] === p]
    },
  ],
  [
    'callbackify',
    (u) => callback((cb) => u.callbackify(async (a) => a + 1)(1, cb)),
  ],
  [
    'callbackify rejects',
    (u) =>
      callback((cb) =>
        u.callbackify(async () => {
          throw new RangeError('x')
        })(cb)
      ),
  ],
  ...[null, undefined, 0, 0n, false, '', Number.NaN].map((value) => [
    `callbackify falsy ${typeof value} ${String(value)}`,
    (u) => callback((cb) => u.callbackify(() => Promise.reject(value))(cb)),
  ]),
  ...[1, 'a', true, {}].map((value) => [
    `callbackify truthy ${typeof value} ${String(value)}`,
    (u) => callback((cb) => u.callbackify(() => Promise.reject(value))(cb)),
  ]),
  [
    'callbackify name and length',
    (u) => {
      const fn = u.callbackify(async function foo(a, b) {
        return a + b
      })
      return [fn.name, fn.length]
    },
  ],
  ['callbackify without a callback', (u) => u.callbackify(async () => 1)(1)],
  ['callbackify not a function', (u) => u.callbackify('x')],
  ['deprecate', (u) => u.deprecate((a) => a + 1, 'm')(1)],
  ['debuglog', (u) => [typeof u.debuglog('x'), u.debuglog('x').enabled]],
  ['toUSVString', (u) => u.toUSVString('a\uD800')],
  ['isArray', (u) => [u.isArray([]), u.isArray({})]],
  ['_extend', (u) => u._extend({ a: 1 }, { b: 2 })],
  ['TextEncoder', (u) => new u.TextEncoder().encode('a')[0]],
  ['TextDecoder', (u) => new u.TextDecoder().decode(new Uint8Array([97]))],
]

for (const [label, make] of VALUES) {
  for (const [name, options] of INSPECT_OPTIONS) {
    CASES.push([`inspect ${name} ${label}`, (u) => u.inspect(make(), options)])
  }
  for (const check of TYPE_CHECKS) {
    CASES.push([`types.${check} ${label}`, (u) => u.types[check](make())])
  }
}

function serialize(value) {
  return value === undefined
    ? 'undefined'
    : JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))
}

/**
 * @param {any} util - the shape of `node:util`
 */
export async function runUtil(util) {
  const lines = []
  for (const [label, fn] of CASES) {
    const result = {}
    try {
      result.verdict = 'pass'
      result.value = serialize(await fn(util))
    } catch (err) {
      result.verdict = 'throw'
      result.name = err.name
      result.code = err.code
      result.message = String(err.message)
    }
    lines.push(`CASE util ${label} ${JSON.stringify(result)}`)
    if (lines.length === 200) {
      console.log(lines.join('\n'))
      lines.length = 0
    }
  }
  console.log(lines.join('\n'))
}
