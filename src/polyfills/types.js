// @ts-nocheck
/**
 * `node:util/types` for browsers. Node.js reads these from V8, here they rely on
 * brand checks so `Symbol.toStringTag` can't fool them where that's possible.
 */

const tagOf = (value) => Object.prototype.toString.call(value)

/**
 * @param {(value: any) => unknown} brandCheck - throws for anything but the type
 */
function isBranded(brandCheck) {
  return (value) => {
    try {
      brandCheck(value)
      return true
    } catch {
      return false
    }
  }
}

const getter = (proto, key) => Object.getOwnPropertyDescriptor(proto, key).get
const isObject = (value) => typeof value === 'object' && value !== null

const sizeOfSet = getter(Set.prototype, 'size')
const sizeOfMap = getter(Map.prototype, 'size')
const sourceOfRegExp = getter(RegExp.prototype, 'source')
const byteLengthOfBuffer = getter(ArrayBuffer.prototype, 'byteLength')
const byteLengthOfSharedBuffer =
  typeof SharedArrayBuffer === 'undefined'
    ? undefined
    : getter(SharedArrayBuffer.prototype, 'byteLength')
const byteLengthOfView = getter(DataView.prototype, 'byteLength')

/** `undefined` for anything that isn't a typed array, that includes a DataView. */
export const typedArrayTag = (value) =>
  getter(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).call(
    value
  )

const isTyped = (name) => (value) => typedArrayTag(value) === name

export const isSet = isBranded((v) => sizeOfSet.call(v))
export const isMap = isBranded((v) => sizeOfMap.call(v))
export const isDate = isBranded((v) => Date.prototype.getTime.call(v))
export const isRegExp = isBranded((v) => sourceOfRegExp.call(v))
export const isWeakMap = isBranded((v) => WeakMap.prototype.has.call(v, {}))
export const isWeakSet = isBranded((v) => WeakSet.prototype.has.call(v, {}))
export const isDataView = isBranded((v) => byteLengthOfView.call(v))
export const isArrayBuffer = isBranded((v) => byteLengthOfBuffer.call(v))
export const isSharedArrayBuffer = isBranded((v) =>
  byteLengthOfSharedBuffer.call(v)
)
export const isAnyArrayBuffer = (v) =>
  isArrayBuffer(v) || isSharedArrayBuffer(v)
export const isArrayBufferView = (v) => ArrayBuffer.isView(v)
export const isTypedArray = (v) => typedArrayTag(v) !== undefined

export const isInt8Array = isTyped('Int8Array')
export const isInt16Array = isTyped('Int16Array')
export const isInt32Array = isTyped('Int32Array')
export const isUint8Array = isTyped('Uint8Array')
export const isUint8ClampedArray = isTyped('Uint8ClampedArray')
export const isUint16Array = isTyped('Uint16Array')
export const isUint32Array = isTyped('Uint32Array')
export const isFloat16Array = isTyped('Float16Array')
export const isFloat32Array = isTyped('Float32Array')
export const isFloat64Array = isTyped('Float64Array')
export const isBigInt64Array = isTyped('BigInt64Array')
export const isBigUint64Array = isTyped('BigUint64Array')

const isBoxed = (type) => {
  const check = isBranded((v) => type.prototype.valueOf.call(v))
  return (v) => isObject(v) && check(v)
}

export const isNumberObject = isBoxed(Number)
export const isStringObject = isBoxed(String)
export const isBooleanObject = isBoxed(Boolean)
export const isBigIntObject = isBoxed(BigInt)
export const isSymbolObject = isBoxed(Symbol)
export const isBoxedPrimitive = (v) =>
  isNumberObject(v) ||
  isStringObject(v) ||
  isBooleanObject(v) ||
  isBigIntObject(v) ||
  isSymbolObject(v)

export const isPromise = (v) =>
  v instanceof Promise || tagOf(v) === '[object Promise]'
export const isNativeError = (v) =>
  typeof Error.isError === 'function'
    ? Error.isError(v)
    : tagOf(v) === '[object Error]'
export const isCryptoKey = (v) =>
  typeof CryptoKey !== 'undefined' && v instanceof CryptoKey

export const isArgumentsObject = (v) => tagOf(v) === '[object Arguments]'
export const isMapIterator = (v) => tagOf(v) === '[object Map Iterator]'
export const isSetIterator = (v) => tagOf(v) === '[object Set Iterator]'
export const isGeneratorObject = (v) =>
  ['[object Generator]', '[object AsyncGenerator]'].includes(tagOf(v))
export const isGeneratorFunction = (v) =>
  ['[object GeneratorFunction]', '[object AsyncGeneratorFunction]'].includes(
    tagOf(v)
  )
export const isAsyncFunction = (v) =>
  ['[object AsyncFunction]', '[object AsyncGeneratorFunction]'].includes(
    tagOf(v)
  )
export const isModuleNamespaceObject = (v) => tagOf(v) === '[object Module]'

// There's nothing in a browser that could tell these.
export const isExternal = () => false
export const isKeyObject = () => false
export const isProxy = () => false
