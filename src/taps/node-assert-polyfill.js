// @ts-nocheck
/** biome-ignore-all lint/complexity/noArguments: `arguments.length` is what tells a missing argument from `undefined`, same as Node.js */
/** biome-ignore-all lint/suspicious/noAssignInExpressions: same as Node.js */
/** biome-ignore-all lint/suspicious/noDoubleEquals: loose equality is the point */
/** biome-ignore-all lint/suspicious/noSelfCompare: NaN checks, same as Node.js */
/** biome-ignore-all lint/style/noParameterAssign: same as Node.js */
/**
 * `node:assert` for browsers. A port of `lib/assert.js` and
 * `lib/internal/util/comparisons.js` from Node.js v24 (MIT), with no Node.js
 * internals. The polyfill only provides `AssertionError` and its messages.
 *
 * Wrapping the deep equal of the polyfill isn't enough, its wrong results also
 * apply to what is nested. `{ url: new URL('http://a.com') }` for example.
 *
 * Use `./node-assert.js`, which picks the built-in `assert` in Node.js.
 */
import polyfill from 'assert'
import { inspect } from 'util'

const { AssertionError } = polyfill

/**
 * @param {Function} Type
 * @param {string} code
 * @param {string} message
 */
function codedError(Type, code, message) {
  const err = new Type(message)
  err.code = code
  return err
}

const missingArgs = () =>
  codedError(
    TypeError,
    'ERR_MISSING_ARGS',
    'The "actual" and "expected" arguments must be specified'
  )

// #region type checks, without the internal bindings of Node.js

const toStringTag = (value) => Object.prototype.toString.call(value)
const hasOwn = (value, key) => Object.hasOwn(value, key)
const hasEnumerable = (value, key) =>
  Object.prototype.propertyIsEnumerable.call(value, key)

/**
 * A check that doesn't lie about `Symbol.toStringTag` or objects from another realm.
 *
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

const sizeOfSet = getter(Set.prototype, 'size')
const sizeOfMap = getter(Map.prototype, 'size')
const sourceOfRegExp = getter(RegExp.prototype, 'source')
const byteLengthOfBuffer = getter(ArrayBuffer.prototype, 'byteLength')
const byteLengthOfSharedBuffer =
  typeof SharedArrayBuffer === 'undefined'
    ? undefined
    : getter(SharedArrayBuffer.prototype, 'byteLength')
const typedArrayTag = getter(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag
)

const isSet = isBranded((v) => sizeOfSet.call(v))
const isMap = isBranded((v) => sizeOfMap.call(v))
const isDate = isBranded((v) => Date.prototype.getTime.call(v))
const isRegExp = isBranded((v) => sourceOfRegExp.call(v))
const isWeakMap = isBranded((v) => WeakMap.prototype.has.call(v, {}))
const isWeakSet = isBranded((v) => WeakSet.prototype.has.call(v, {}))
const isNumberObject = (v) =>
  typeof v === 'object' && isBranded((b) => Number.prototype.valueOf.call(b))(v)
const isStringObject = (v) =>
  typeof v === 'object' && isBranded((b) => String.prototype.valueOf.call(b))(v)
const isBooleanObject = (v) =>
  typeof v === 'object' &&
  isBranded((b) => Boolean.prototype.valueOf.call(b))(v)
const isBigIntObject = (v) =>
  typeof v === 'object' && isBranded((b) => BigInt.prototype.valueOf.call(b))(v)
const isSymbolObject = (v) =>
  typeof v === 'object' && isBranded((b) => Symbol.prototype.valueOf.call(b))(v)
const isBoxedPrimitive = (v) =>
  isNumberObject(v) ||
  isStringObject(v) ||
  isBooleanObject(v) ||
  isBigIntObject(v) ||
  isSymbolObject(v)
const isAnyArrayBuffer = (v) =>
  isBranded((b) => byteLengthOfBuffer.call(b))(v) ||
  (byteLengthOfSharedBuffer !== undefined &&
    isBranded((b) => byteLengthOfSharedBuffer.call(b))(v))
const isFloatArray = (v) =>
  ['Float16Array', 'Float32Array', 'Float64Array'].includes(
    typedArrayTag.call(v)
  )
const isPromise = (v) =>
  v instanceof Promise || toStringTag(v) === '[object Promise]'
const isNativeError = (v) =>
  typeof Error.isError === 'function'
    ? Error.isError(v)
    : toStringTag(v) === '[object Error]'
const isError = (v) => isNativeError(v) || v instanceof Error
const isCryptoKey = (v) =>
  typeof CryptoKey !== 'undefined' && v instanceof CryptoKey
const isURL = (v) =>
  Boolean(v?.href && v.protocol && v.auth === undefined && v.path === undefined)

// #endregion

// #region comparisons

const kStrict = 2
const kStrictWithoutPrototypes = 3
const kLoose = 0
const kPartial = 1

const kNoIterator = 0
const kIsArray = 1
const kIsSet = 2
const kIsMap = 3

const wellKnownConstructors = new Set(
  [
    Array,
    ArrayBuffer,
    BigInt,
    BigInt64Array,
    BigUint64Array,
    Boolean,
    DataView,
    Date,
    Error,
    Float32Array,
    Float64Array,
    Function,
    Int16Array,
    Int32Array,
    Int8Array,
    Map,
    Number,
    Object,
    Promise,
    RegExp,
    Set,
    String,
    Symbol,
    Uint16Array,
    Uint32Array,
    Uint8Array,
    Uint8ClampedArray,
    WeakMap,
    WeakSet,
    globalThis.Float16Array,
    globalThis.Buffer,
  ].filter(Boolean)
)

const isIndex = (key) => {
  const index = Number(key)
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === key
  )
}

function getOwnNonIndexProperties(value, skipSymbols) {
  const keys = Object.keys(value).filter((key) => !isIndex(key))
  if (!skipSymbols) {
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (hasEnumerable(value, key)) {
        keys.push(key)
      }
    }
  }
  return keys
}

const toBytes = (view) =>
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength)

function bytesEqual(a, b) {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

function areSimilarTypedArrays(a, b) {
  if (a.byteLength !== b.byteLength) {
    return false
  }
  // The tag is `undefined` for a DataView and for anything that isn't a view, so
  // `b` can get here. Node.js throws from comparing its bytes, whatever the method.
  if (!ArrayBuffer.isView(b)) {
    throw codedError(
      TypeError,
      'ERR_INVALID_ARG_TYPE',
      `The "buf2" argument must be an instance of Buffer or Uint8Array. Received ${inspect(b)}`
    )
  }
  return bytesEqual(toBytes(a), toBytes(b))
}

function isPartialUint8Array(a, b) {
  const lenA = a.length
  const lenB = b.length
  if (lenA < lenB) {
    return false
  }
  let offsetA = 0
  for (let offsetB = 0; offsetB < lenB; offsetB++) {
    while (a[offsetA] !== b[offsetB]) {
      offsetA++
      if (offsetA > lenA - lenB + offsetB) {
        return false
      }
    }
    offsetA++
  }
  return true
}

function isPartialArrayBufferView(a, b) {
  if (a.byteLength < b.byteLength) {
    return false
  }
  return isPartialUint8Array(toBytes(a), toBytes(b))
}

function areSimilarFloatArrays(a, b) {
  if (a.length !== b.length) {
    return false
  }
  for (let offset = 0; offset < a.length; offset++) {
    if (a[offset] !== b[offset]) {
      return false
    }
  }
  return true
}

function isEqualBoxedPrimitive(val1, val2) {
  if (isNumberObject(val1)) {
    return (
      isNumberObject(val2) &&
      Object.is(
        Number.prototype.valueOf.call(val1),
        Number.prototype.valueOf.call(val2)
      )
    )
  }
  if (isStringObject(val1)) {
    return (
      isStringObject(val2) &&
      String.prototype.valueOf.call(val1) ===
        String.prototype.valueOf.call(val2)
    )
  }
  if (isBooleanObject(val1)) {
    return (
      isBooleanObject(val2) &&
      Boolean.prototype.valueOf.call(val1) ===
        Boolean.prototype.valueOf.call(val2)
    )
  }
  if (isBigIntObject(val1)) {
    return (
      isBigIntObject(val2) &&
      BigInt.prototype.valueOf.call(val1) ===
        BigInt.prototype.valueOf.call(val2)
    )
  }
  return (
    isSymbolObject(val2) &&
    Symbol.prototype.valueOf.call(val1) === Symbol.prototype.valueOf.call(val2)
  )
}

function isEnumerableOrIdentical(val1, val2, prop, mode, memos) {
  return (
    hasEnumerable(val2, prop) || // This is handled by Object.keys()
    (mode === kPartial &&
      (val2[prop] === undefined ||
        (prop === 'message' && val2[prop] === ''))) ||
    innerDeepEqual(val1[prop], val2[prop], mode, memos)
  )
}

function innerDeepEqual(val1, val2, mode, memos) {
  // All identical values are equivalent, as determined by ===.
  if (val1 === val2) {
    return val1 !== 0 || Object.is(val1, val2) || mode === kLoose
  }

  // Check more closely if val1 and val2 are equal.
  if (mode === kLoose) {
    if (val1 === null || typeof val1 !== 'object') {
      return (
        (val2 === null || typeof val2 !== 'object') &&
        // Check for NaN
        (val1 == val2 || (val1 !== val1 && val2 !== val2))
      )
    }
    if (val2 === null || typeof val2 !== 'object') {
      return false
    }
  } else {
    if (typeof val1 === 'number') {
      // Check for NaN
      return val1 !== val1 && val2 !== val2
    }
    if (
      typeof val2 !== 'object' ||
      typeof val1 !== 'object' ||
      val1 === null ||
      val2 === null
    ) {
      return false
    }
  }
  return objectComparisonStart(val1, val2, mode, memos)
}

function hasUnequalTag(val1, val2) {
  return val1[Symbol.toStringTag] !== val2[Symbol.toStringTag]
}

function slowHasUnequalTag(val1Tag, val1, val2) {
  if (
    val1[Symbol.toStringTag] !== undefined &&
    val2[Symbol.toStringTag] !== undefined
  ) {
    return val1[Symbol.toStringTag] !== val2[Symbol.toStringTag]
  }
  return val1Tag !== toStringTag(val2)
}

function objectComparisonStart(val1, val2, mode, memos) {
  if (mode === kStrict) {
    if (
      wellKnownConstructors.has(val1.constructor) ||
      (val1.constructor !== undefined && !hasOwn(val1, 'constructor'))
    ) {
      if (val1.constructor !== val2.constructor) {
        return false
      }
    } else if (Object.getPrototypeOf(val1) !== Object.getPrototypeOf(val2)) {
      return false
    }
  }

  if (Array.isArray(val1)) {
    if (
      !Array.isArray(val2) ||
      (val1.length !== val2.length &&
        (mode !== kPartial || val1.length < val2.length)) ||
      hasUnequalTag(val1, val2)
    ) {
      return false
    }

    const keys2 = getOwnNonIndexProperties(val2, mode === kLoose)
    if (
      mode !== kPartial &&
      keys2.length !== getOwnNonIndexProperties(val1, mode === kLoose).length
    ) {
      return false
    }
    return keyCheck(val1, val2, mode, memos, kIsArray, keys2)
  }

  let val1Tag
  if (
    val1[Symbol.toStringTag] === undefined &&
    (val1Tag = toStringTag(val1)) === '[object Object]'
  ) {
    if (slowHasUnequalTag(val1Tag, val1, val2)) {
      return false
    }
    return keyCheck(val1, val2, mode, memos, kNoIterator)
  }
  if (isSet(val1)) {
    if (
      !isSet(val2) ||
      (val1.size !== val2.size &&
        (mode !== kPartial || val1.size < val2.size)) ||
      hasUnequalTag(val1, val2)
    ) {
      return false
    }
    return keyCheck(val1, val2, mode, memos, kIsSet)
  }
  if (isMap(val1)) {
    if (
      !isMap(val2) ||
      (val1.size !== val2.size &&
        (mode !== kPartial || val1.size < val2.size)) ||
      hasUnequalTag(val1, val2)
    ) {
      return false
    }
    return keyCheck(val1, val2, mode, memos, kIsMap)
  }
  if (ArrayBuffer.isView(val1)) {
    if (typedArrayTag.call(val1) !== typedArrayTag.call(val2)) {
      return false
    }
    if (mode === kPartial && val1.byteLength !== val2.byteLength) {
      if (!isPartialArrayBufferView(val1, val2)) {
        return false
      }
    } else if (
      mode === kLoose &&
      !(val1 instanceof DataView) &&
      isFloatArray(val1)
    ) {
      if (!areSimilarFloatArrays(val1, val2)) {
        return false
      }
    } else if (!areSimilarTypedArrays(val1, val2)) {
      return false
    }
    // Same bytes, what is left to compare are the non index properties.
    const keys2 = getOwnNonIndexProperties(val2, mode === kLoose)
    if (
      mode !== kPartial &&
      keys2.length !== getOwnNonIndexProperties(val1, mode === kLoose).length
    ) {
      return false
    }
    return keyCheck(val1, val2, mode, memos, kNoIterator, keys2)
  }
  if (isDate(val1)) {
    if (!isDate(val2) || hasUnequalTag(val1, val2)) {
      return false
    }
    const time1 = Date.prototype.getTime.call(val1)
    const time2 = Date.prototype.getTime.call(val2)
    if (time1 !== time2 && (time1 === time1 || time2 === time2)) {
      return false
    }
  } else if (isRegExp(val1)) {
    if (
      !isRegExp(val2) ||
      val1.source !== val2.source ||
      val1.flags !== val2.flags ||
      val1.lastIndex !== val2.lastIndex ||
      hasUnequalTag(val1, val2)
    ) {
      return false
    }
  } else if (isAnyArrayBuffer(val1)) {
    if (!isAnyArrayBuffer(val2) || hasUnequalTag(val1, val2)) {
      return false
    }
    if (mode !== kPartial || val1.byteLength === val2.byteLength) {
      if (!bytesEqual(new Uint8Array(val1), new Uint8Array(val2))) {
        return false
      }
    } else if (
      !isPartialUint8Array(new Uint8Array(val1), new Uint8Array(val2))
    ) {
      return false
    }
  } else if (
    slowHasUnequalTag(val1Tag ?? toStringTag(val1), val1, val2) ||
    Array.isArray(val2) ||
    ArrayBuffer.isView(val2) ||
    isSet(val2) ||
    isMap(val2) ||
    isDate(val2) ||
    isRegExp(val2) ||
    isAnyArrayBuffer(val2)
  ) {
    return false
  } else if (isError(val1)) {
    // Do not compare the stack as it might differ even though the error itself
    // is otherwise identical.
    if (
      !isError(val2) ||
      !isEnumerableOrIdentical(val1, val2, 'message', mode, memos) ||
      !isEnumerableOrIdentical(val1, val2, 'name', mode, memos) ||
      !isEnumerableOrIdentical(val1, val2, 'cause', mode, memos) ||
      !isEnumerableOrIdentical(val1, val2, 'errors', mode, memos)
    ) {
      return false
    }
    const hasOwnVal2Cause = hasOwn(val2, 'cause')
    if (
      hasOwnVal2Cause !== hasOwn(val1, 'cause') &&
      (mode !== kPartial || hasOwnVal2Cause)
    ) {
      return false
    }
  } else if (isBoxedPrimitive(val1)) {
    if (!isEqualBoxedPrimitive(val1, val2)) {
      return false
    }
  } else if (isURL(val1)) {
    if (!isURL(val2) || val1.href !== val2.href) {
      return false
    }
  } else if (isCryptoKey(val1)) {
    // There's no way to read the key material of two keys to compare them, and
    // they aren't identical or this wouldn't run. Never call them equal.
    return false
  } else if (
    isBoxedPrimitive(val2) ||
    isNativeError(val2) ||
    val2 instanceof Error ||
    isWeakMap(val1) ||
    isWeakSet(val1) ||
    isPromise(val1)
  ) {
    return false
  }

  return keyCheck(val1, val2, mode, memos, kNoIterator)
}

function keyCheck(val1, val2, mode, memos, iterationType, keys2) {
  // For all remaining Object pairs, including Array, objects and Maps,
  // equivalence is determined by having:
  // a) The same number of owned enumerable properties
  // b) The same set of keys/indexes (although not necessarily the same order)
  // c) Equivalent values for every corresponding key/index
  // d) For Sets and Maps, equal contents
  // Note: this accounts for both named and indexed properties on Arrays.
  const isArrayLikeObject = keys2 !== undefined

  if (keys2 === undefined) {
    keys2 = Object.keys(val2)
  }
  let keys1

  if (!isArrayLikeObject) {
    // The pair must have the same number of owned properties.
    if (mode === kPartial) {
      for (const key of Object.getOwnPropertySymbols(val2)) {
        if (hasEnumerable(val2, key)) {
          keys2.push(key)
        }
      }
    } else if (keys2.length !== (keys1 = Object.keys(val1)).length) {
      return false
    } else if (mode === kStrict || mode === kStrictWithoutPrototypes) {
      for (const key of Object.getOwnPropertySymbols(val1)) {
        if (hasEnumerable(val1, key)) {
          keys1.push(key)
        }
      }
      for (const key of Object.getOwnPropertySymbols(val2)) {
        if (hasEnumerable(val2, key)) {
          keys2.push(key)
        }
      }
      if (keys1.length !== keys2.length) {
        return false
      }
    }
  }

  if (
    keys2.length === 0 &&
    (iterationType === kNoIterator ||
      (iterationType === kIsArray && val2.length === 0) ||
      val2.size === 0)
  ) {
    return true
  }

  if (memos === null) {
    return objEquiv(val1, val2, mode, keys1, keys2, memos, iterationType)
  }
  return handleCycles(val1, val2, mode, keys1, keys2, memos, iterationType)
}

function handleCycles(val1, val2, mode, keys1, keys2, memos, iterationType) {
  // Use memos to handle cycles.
  if (memos === undefined) {
    memos = {
      set: undefined,
      a: val1,
      b: val2,
      c: undefined,
      d: undefined,
      deep: false,
    }
    return objEquiv(val1, val2, mode, keys1, keys2, memos, iterationType)
  }

  if (memos.set === undefined) {
    if (memos.deep === false) {
      if (memos.a === val1) {
        return memos.b === val2
      }
      if (memos.b === val2) {
        return false
      }
      memos.c = val1
      memos.d = val2
      memos.deep = true
      const result = objEquiv(
        val1,
        val2,
        mode,
        keys1,
        keys2,
        memos,
        iterationType
      )
      memos.deep = false
      if (memos.set !== undefined) {
        memos.set.delete(memos.c)
        memos.set.delete(memos.d)
      }
      return result
    }
    memos.set = new Set()
    memos.set.add(memos.a)
    memos.set.add(memos.b)
    memos.set.add(memos.c)
    memos.set.add(memos.d)
  }

  const { set } = memos

  const originalSize = set.size
  set.add(val1)
  set.add(val2)
  if (originalSize !== set.size - 2) {
    return originalSize === set.size
  }

  const areEq = objEquiv(val1, val2, mode, keys1, keys2, memos, iterationType)

  set.delete(val1)
  set.delete(val2)

  return areEq
}

// It is not possible to detect corresponding values properly in case the type is
// a string, number, bigint or boolean, those values can match lots of different
// string values (e.g., 1n == '+00001').
function findLooseMatchingPrimitives(prim) {
  switch (typeof prim) {
    case 'undefined':
      return null
    case 'object': // Only pass in null as object!
      return undefined
    case 'symbol':
      return false
    case 'string':
      prim = +prim
      // Loose equal entries exist only if the string is possible to convert to
      // a regular number and not NaN.
      if (prim !== prim) {
        return false
      }
      return true
    case 'number':
      if (prim !== prim) {
        return false
      }
      return true
    default:
      return true
  }
}

function setMightHaveLoosePrim(a, b, prim) {
  const altValue = findLooseMatchingPrimitives(prim)
  if (altValue != null) {
    return altValue
  }
  return !b.has(altValue) && a.has(altValue)
}

function mapMightHaveLoosePrim(a, b, prim, item2, memo) {
  const altValue = findLooseMatchingPrimitives(prim)
  if (altValue != null) {
    return altValue
  }
  const item1 = a.get(altValue)
  if (
    (item1 === undefined && !a.has(altValue)) ||
    !innerDeepEqual(item1, item2, kLoose, memo)
  ) {
    return false
  }
  return !b.has(altValue) && innerDeepEqual(item1, item2, kLoose, memo)
}

function partialObjectSetEquiv(array, a, b, mode, memo) {
  let aPos = 0
  let direction = 1
  let start = 0
  let end = array.length - 1
  for (const val1 of a) {
    aPos++
    if (!b.has(val1)) {
      let innerStart = start
      if (direction === 1) {
        if (innerDeepEqual(val1, array[start], mode, memo)) {
          if (start === end) {
            return true
          }
          start += 1
          continue
        }
        if (start === end) {
          // The last element of set b might match a later element in set a.
          continue
        }
        direction = -1
        innerStart += 1
      }
      let matched = true
      if (!innerDeepEqual(val1, array[end], mode, memo)) {
        direction = 1
        matched = arrayHasEqualElement(
          array,
          val1,
          mode,
          memo,
          innerDeepEqual,
          innerStart,
          end
        )
      }
      if (matched) {
        if (start === end) {
          return true
        }
        end -= 1
      }
    }
    if (a.size - aPos <= end - start) {
      return false
    }
  }
  return false
}

function arrayHasEqualElement(array, val1, mode, memo, comparator, start, end) {
  for (let i = end - 1; i >= start; i--) {
    if (comparator(val1, array[i], mode, memo)) {
      // Move the matching element to make sure we do not check that again.
      array[i] = array[end]
      return true
    }
  }
  return false
}

function setObjectEquiv(array, a, b, mode, memo) {
  let direction = 1
  let start = 0
  let end = array.length - 1
  const comparator = mode === kLoose ? innerDeepEqual : objectComparisonStart
  const extraChecks = mode === kLoose || array.length !== a.size
  for (const val1 of a) {
    // Primitive and null members can only match by identity, and must never
    // reach objectComparisonStart (which throws on `val.constructor` for
    // null/undefined). Resolve them directly for every such member.
    if (typeof val1 !== 'object' || val1 === null) {
      if (b.has(val1)) {
        continue
      }
      if (mode !== kLoose) {
        return false
      }
    } else if (extraChecks && b.has(val1)) {
      continue
    }

    let innerStart = start
    if (direction === 1) {
      if (comparator(val1, array[start], mode, memo)) {
        start += 1
        continue
      }
      if (start === end) {
        return false
      }
      direction = -1
      innerStart += 1
    }
    if (!comparator(val1, array[end], mode, memo)) {
      direction = 1
      if (
        !arrayHasEqualElement(
          array,
          val1,
          mode,
          memo,
          comparator,
          innerStart,
          end
        )
      ) {
        return false
      }
    }
    end -= 1
  }
  return true
}

function compareSmallSets(a, b, val, iteratorB, mode, memo) {
  const iteratorA = a.values()
  const firstA = iteratorA.next().value
  const first = innerDeepEqual(firstA, val, mode, memo)
  if (first) {
    if (b.size === 1) {
      // Partial mode && a.size === 1 || b.size === 1
      return true
    }
    const secondA = iteratorA.next().value
    return (
      b.has(secondA) ||
      innerDeepEqual(secondA, iteratorB.next().value, mode, memo)
    )
  }
  return (
    a.size !== 1 &&
    innerDeepEqual(iteratorA.next().value, val, mode, memo) &&
    (b.size === 1 || // Partial mode
      b.has(firstA) || // Primitive or reference equal
      innerDeepEqual(firstA, iteratorB.next().value, mode, memo))
  )
}

function setEquiv(a, b, mode, memo) {
  // This is a lazily initiated Set of entries which have to be compared
  // pairwise.
  let array

  const iteratorB = b.values()
  for (const val of iteratorB) {
    if (!a.has(val)) {
      if (
        (typeof val !== 'object' || val === null) &&
        (mode !== kLoose || !setMightHaveLoosePrim(a, b, val))
      ) {
        return false
      }

      if (array === undefined) {
        if (a.size < 3) {
          return compareSmallSets(a, b, val, iteratorB, mode, memo)
        }
        array = []
      }
      // If the specified value doesn't exist in the second set it's a object
      // (or in loose mode: a non-matching primitive). Find the
      // deep-(mode-)equal element in a set copy to reduce duplicate checks.
      array.push(val)
    }
  }

  if (array === undefined) {
    return true
  }
  if (mode === kPartial) {
    return partialObjectSetEquiv(array, a, b, mode, memo)
  }
  return setObjectEquiv(array, a, b, mode, memo)
}

function partialObjectMapEquiv(array, a, b, mode, memo) {
  let aPos = 0
  let direction = 1
  let start = 0
  let end = array.length - 1
  for (const { 0: key1, 1: item1 } of a) {
    aPos++
    if (typeof key1 === 'object' && key1 !== null) {
      let innerStart = start
      if (direction === 1) {
        const key2 = array[start]
        if (
          objectComparisonStart(key1, key2, mode, memo) &&
          innerDeepEqual(item1, b.get(key2), mode, memo)
        ) {
          if (start === end) {
            return true
          }
          start += 1
          continue
        }
        if (start === end) {
          // The last element of map b might match a later element in map a.
          continue
        }
        direction = -1
        innerStart += 1
      }
      let matched = true
      const key2 = array[end]
      if (
        !objectComparisonStart(key1, key2, mode, memo) ||
        !innerDeepEqual(item1, b.get(key2), mode, memo)
      ) {
        direction = 1
        matched = arrayHasEqualMapElement(
          array,
          key1,
          item1,
          b,
          mode,
          memo,
          objectComparisonStart,
          innerStart,
          end
        )
      }
      if (matched) {
        if (start === end) {
          return true
        }
        end -= 1
      }
    }
    if (a.size - aPos <= end - start) {
      return false
    }
  }
  return false
}

function arrayHasEqualMapElement(
  array,
  key1,
  item1,
  b,
  mode,
  memo,
  comparator,
  start,
  end
) {
  for (let i = end - 1; i >= start; i--) {
    const key2 = array[i]
    if (
      comparator(key1, key2, mode, memo) &&
      innerDeepEqual(item1, b.get(key2), mode, memo)
    ) {
      // Move the matching element to make sure we do not check that again.
      array[i] = array[end]
      return true
    }
  }
  return false
}

function mapObjectEquiv(array, a, b, mode, memo) {
  let direction = 1
  let start = 0
  let end = array.length - 1
  const comparator = mode === kLoose ? innerDeepEqual : objectComparisonStart

  for (const { 0: key1, 1: item1 } of a) {
    // Primitive and `null` keys can never match an object key collected in
    // `array`, so resolve them directly against `b`. `null` is `typeof
    // 'object'`, so without this it would reach the object comparator, which
    // reads `key1.constructor` and throws a `TypeError`.
    if (typeof key1 !== 'object' || key1 === null) {
      if (b.has(key1)) {
        if (mode !== kLoose || innerDeepEqual(item1, b.get(key1), mode, memo)) {
          continue
        }
      } else if (mode !== kLoose) {
        return false
      }
    }

    let innerStart = start
    if (direction === 1) {
      const key2 = array[start]
      if (
        comparator(key1, key2, mode, memo) &&
        innerDeepEqual(item1, b.get(key2), mode, memo)
      ) {
        start += 1
        continue
      }
      if (start === end) {
        return false
      }
      direction = -1
      innerStart += 1
    }
    const key2 = array[end]
    if (
      !comparator(key1, key2, mode, memo) ||
      !innerDeepEqual(item1, b.get(key2), mode, memo)
    ) {
      direction = 1
      if (
        !arrayHasEqualMapElement(
          array,
          key1,
          item1,
          b,
          mode,
          memo,
          comparator,
          innerStart,
          end
        )
      ) {
        return false
      }
    }
    end -= 1
  }
  return true
}

function mapEquiv(a, b, mode, memo) {
  let array

  for (const { 0: key2, 1: item2 } of b) {
    if (typeof key2 === 'object' && key2 !== null) {
      if (array === undefined) {
        if (a.size === 1) {
          const { 0: key1, 1: item1 } = a.entries().next().value
          return (
            innerDeepEqual(key1, key2, mode, memo) &&
            innerDeepEqual(item1, item2, mode, memo)
          )
        }
        array = []
      }
      array.push(key2)
    } else {
      // By directly retrieving the value we prevent another b.has(key2) check in
      // almost all possible cases.
      const item1 = a.get(key2)
      if (
        (item1 === undefined && !a.has(key2)) ||
        !innerDeepEqual(item1, item2, mode, memo)
      ) {
        if (mode !== kLoose) {
          return false
        }
        // Fast path to detect missing string, symbol, undefined and null
        // keys.
        if (!mapMightHaveLoosePrim(a, b, key2, item2, memo)) {
          return false
        }
        if (array === undefined) {
          array = []
        }
        array.push(key2)
      }
    }
  }

  if (array === undefined) {
    return true
  }

  if (mode === kPartial) {
    return partialObjectMapEquiv(array, a, b, mode, memo)
  }

  return mapObjectEquiv(array, a, b, mode, memo)
}

function partialSparseArrayEquiv(a, b, mode, memos, startA, startB) {
  let aPos = startA
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  const lenA = keysA.length - startA
  const lenB = keysB.length - startB
  if (lenA < lenB) {
    return false
  }
  for (let i = 0; i < lenB; i++) {
    const keyB = keysB[startB + i]
    while (!innerDeepEqual(a[keysA[aPos]], b[keyB], mode, memos)) {
      aPos++
      if (aPos > keysA.length - lenB + i) {
        return false
      }
    }
    aPos++
  }
  return true
}

function partialArrayEquiv(a, b, mode, memos) {
  let aPos = 0
  for (let i = 0; i < b.length; i++) {
    let isSparse = b[i] === undefined && !hasOwn(b, i)
    if (isSparse) {
      return partialSparseArrayEquiv(a, b, mode, memos, aPos, i)
    }
    while (
      !(isSparse = a[aPos] === undefined && !hasOwn(a, aPos)) &&
      !innerDeepEqual(a[aPos], b[i], mode, memos)
    ) {
      aPos++
      if (aPos > a.length - b.length + i) {
        return false
      }
    }
    if (isSparse) {
      return partialSparseArrayEquiv(a, b, mode, memos, aPos, i)
    }
    aPos++
  }
  return true
}

function sparseArrayEquiv(a, b, mode, memos, i) {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) {
    return false
  }
  for (; i < keysB.length; i++) {
    const key = keysB[i]
    if (
      (a[key] === undefined && !hasOwn(a, key)) ||
      !innerDeepEqual(a[key], b[key], mode, memos)
    ) {
      return false
    }
  }
  return true
}

function objEquiv(a, b, mode, keys1, keys2, memos, iterationType) {
  // The pair must have equivalent values for every corresponding key.
  if (keys2.length > 0) {
    let i = 0
    // Ordered keys
    if (keys1 !== undefined) {
      for (; i < keys2.length; i++) {
        const key = keys2[i]
        if (keys1[i] !== key) {
          break
        }
        if (!innerDeepEqual(a[key], b[key], mode, memos)) {
          return false
        }
      }
    }
    // Unordered keys
    for (; i < keys2.length; i++) {
      const key = keys2[i]
      const descriptor = Object.getOwnPropertyDescriptor(a, key)
      if (descriptor === undefined || descriptor.enumerable !== true) {
        return false
      }
      const value =
        descriptor.writable === undefined ? a[key] : descriptor.value
      if (!innerDeepEqual(value, b[key], mode, memos)) {
        return false
      }
    }
  }

  if (iterationType === kIsArray) {
    if (mode === kPartial) {
      return partialArrayEquiv(a, b, mode, memos)
    }
    for (let i = 0; i < a.length; i++) {
      if (b[i] === undefined) {
        if (!hasOwn(b, i)) {
          return sparseArrayEquiv(a, b, mode, memos, i)
        }
        if (
          (a[i] !== undefined || !hasOwn(a, i)) &&
          (mode !== kLoose || a[i] !== null)
        ) {
          return false
        }
      } else if (
        (a[i] === undefined || !innerDeepEqual(a[i], b[i], mode, memos)) &&
        (mode !== kLoose || b[i] !== null)
      ) {
        return false
      }
    }
  } else if (iterationType === kIsSet) {
    if (!setEquiv(a, b, mode, memos)) {
      return false
    }
  } else if (iterationType === kIsMap && !mapEquiv(a, b, mode, memos)) {
    return false
  }

  return true
}

// Only handle cycles when they are detected.
let detectCycles = (val1, val2, mode) => {
  try {
    return innerDeepEqual(val1, val2, mode, null)
  } catch {
    detectCycles = innerDeepEqual
    return innerDeepEqual(val1, val2, mode, undefined)
  }
}

const isDeepEqual = (val1, val2) => detectCycles(val1, val2, kLoose)
const isDeepStrictEqual = (val1, val2, skipPrototype) =>
  detectCycles(val1, val2, skipPrototype ? kStrictWithoutPrototypes : kStrict)
const isPartialStrictEqual = (val1, val2) => detectCycles(val1, val2, kPartial)

// #endregion

// #region assert

const NO_EXCEPTION_SENTINEL = {}
const kOptions = Symbol('options')

function innerFail(obj) {
  if (obj.message instanceof Error) {
    throw obj.message
  }
  throw new AssertionError(obj)
}

function innerOk(fn, argLen, value, message) {
  if (!value) {
    let generatedMessage = false

    if (argLen === 0) {
      generatedMessage = true
      message = 'No value argument passed to `assert.ok()`'
    } else if (message == null) {
      generatedMessage = true
      message = `The expression evaluated to a falsy value:\n\n  assert.ok(${inspect(value)})\n`
    } else if (isError(message)) {
      throw message
    }

    const err = new AssertionError({
      actual: value,
      expected: true,
      message,
      operator: '==',
      stackStartFn: fn,
    })
    err.generatedMessage = generatedMessage
    throw err
  }
}

/**
 * @param {{ diff?: 'simple' | 'full', strict?: boolean, skipPrototype?: boolean }} [options]
 *   `diff` is accepted and ignored, messages can be worded differently from Node.js.
 */
export function Assert(options) {
  if (!new.target) {
    throw codedError(
      TypeError,
      'ERR_CONSTRUCT_CALL_REQUIRED',
      "Class constructor Assert cannot be invoked without 'new'"
    )
  }

  options = { strict: true, skipPrototype: false, ...options }

  if (
    options.diff !== undefined &&
    !['simple', 'full'].includes(options.diff)
  ) {
    throw codedError(
      TypeError,
      'ERR_INVALID_ARG_VALUE',
      `The property 'options.diff' must be one of: 'simple', 'full'. Received ${inspect(options.diff)}`
    )
  }

  this.AssertionError = AssertionError
  Object.defineProperty(this, kOptions, { value: options })

  if (options.strict) {
    this.equal = this.strictEqual
    this.deepEqual = this.deepStrictEqual
    this.notEqual = this.notStrictEqual
    this.notDeepEqual = this.notDeepStrictEqual
  }
}

Assert.prototype.fail = function fail(
  actual,
  expected,
  message,
  operator,
  stackStartFn
) {
  const argsLen = arguments.length

  let internalMessage = false
  if (actual == null && argsLen <= 1) {
    internalMessage = true
    message = 'Failed'
  } else if (argsLen === 1) {
    message = actual
    actual = undefined
  } else if (argsLen === 2) {
    operator = '!='
  }

  if (message instanceof Error) {
    throw message
  }

  const err = new AssertionError({
    actual,
    expected,
    operator: operator === undefined ? 'fail' : operator,
    stackStartFn: stackStartFn || fail,
    message,
  })
  if (internalMessage) {
    err.generatedMessage = true
  }
  throw err
}

Assert.prototype.ok = function ok(...args) {
  innerOk(ok, args.length, ...args)
}

Assert.prototype.equal = function equal(actual, expected, message) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (
    actual != expected &&
    (!Number.isNaN(actual) || !Number.isNaN(expected))
  ) {
    innerFail({
      actual,
      expected,
      message,
      operator: '==',
      stackStartFn: equal,
    })
  }
}

Assert.prototype.notEqual = function notEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (actual == expected || (Number.isNaN(actual) && Number.isNaN(expected))) {
    innerFail({
      actual,
      expected,
      message,
      operator: '!=',
      stackStartFn: notEqual,
    })
  }
}

Assert.prototype.deepEqual = function deepEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (!isDeepEqual(actual, expected)) {
    innerFail({
      actual,
      expected,
      message,
      operator: 'deepEqual',
      stackStartFn: deepEqual,
    })
  }
}

Assert.prototype.notDeepEqual = function notDeepEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (isDeepEqual(actual, expected)) {
    innerFail({
      actual,
      expected,
      message,
      operator: 'notDeepEqual',
      stackStartFn: notDeepEqual,
    })
  }
}

Assert.prototype.deepStrictEqual = function deepStrictEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (!isDeepStrictEqual(actual, expected, this?.[kOptions]?.skipPrototype)) {
    innerFail({
      actual,
      expected,
      message,
      operator: 'deepStrictEqual',
      stackStartFn: deepStrictEqual,
    })
  }
}

Assert.prototype.notDeepStrictEqual = function notDeepStrictEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (isDeepStrictEqual(actual, expected, this?.[kOptions]?.skipPrototype)) {
    innerFail({
      actual,
      expected,
      message,
      operator: 'notDeepStrictEqual',
      stackStartFn: notDeepStrictEqual,
    })
  }
}

Assert.prototype.strictEqual = function strictEqual(actual, expected, message) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (!Object.is(actual, expected)) {
    innerFail({
      actual,
      expected,
      message,
      operator: 'strictEqual',
      stackStartFn: strictEqual,
    })
  }
}

Assert.prototype.notStrictEqual = function notStrictEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (Object.is(actual, expected)) {
    innerFail({
      actual,
      expected,
      message,
      operator: 'notStrictEqual',
      stackStartFn: notStrictEqual,
    })
  }
}

Assert.prototype.partialDeepStrictEqual = function partialDeepStrictEqual(
  actual,
  expected,
  message
) {
  if (arguments.length < 2) {
    throw missingArgs()
  }
  if (!isPartialStrictEqual(actual, expected)) {
    innerFail({
      actual,
      expected,
      message,
      operator: 'partialDeepStrictEqual',
      stackStartFn: partialDeepStrictEqual,
    })
  }
}

class Comparison {
  constructor(obj, keys, actual) {
    for (const key of keys) {
      if (key in obj) {
        if (
          actual !== undefined &&
          typeof actual[key] === 'string' &&
          isRegExp(obj[key]) &&
          obj[key].exec(actual[key]) !== null
        ) {
          this[key] = actual[key]
        } else {
          this[key] = obj[key]
        }
      }
    }
  }
}

function compareExceptionKey(actual, expected, key, message, keys, fn, name) {
  if (!(key in actual && isDeepStrictEqual(actual[key], expected[key]))) {
    if (!message) {
      // Create placeholder objects to create a nice output.
      const a = new Comparison(actual, keys)
      const b = new Comparison(expected, keys, actual)

      const err = new AssertionError({
        actual: a,
        expected: b,
        operator: 'deepStrictEqual',
        stackStartFn: fn,
      })
      err.actual = actual
      err.expected = expected
      err.operator = name
      throw err
    }
    innerFail({ actual, expected, message, operator: name, stackStartFn: fn })
  }
}

function expectedException(actual, expected, message, fn, name) {
  let generatedMessage = false
  let throwError = false

  if (typeof expected !== 'function') {
    // Handle regular expressions.
    if (isRegExp(expected)) {
      const str = String(actual)
      if (expected.exec(str) !== null) {
        return
      }

      if (!message) {
        generatedMessage = true
        message = `The input did not match the regular expression ${inspect(expected)}. Input:\n\n${inspect(str)}\n`
      }
      throwError = true
      // Handle primitives properly.
    } else if (typeof actual !== 'object' || actual === null) {
      const err = new AssertionError({
        actual,
        expected,
        message,
        operator: 'deepStrictEqual',
        stackStartFn: fn,
      })
      err.operator = name
      throw err
    } else {
      // Handle validation objects.
      const keys = Object.keys(expected)
      // Special handle errors to make sure the name and the message are
      // compared as well.
      if (expected instanceof Error) {
        keys.push('name', 'message')
      } else if (keys.length === 0) {
        throw codedError(
          TypeError,
          'ERR_INVALID_ARG_VALUE',
          `The argument 'error' may not be an empty object. Received ${inspect(expected)}`
        )
      }
      for (const key of keys) {
        if (
          typeof actual[key] === 'string' &&
          isRegExp(expected[key]) &&
          expected[key].exec(actual[key]) !== null
        ) {
          continue
        }
        compareExceptionKey(actual, expected, key, message, keys, fn, name)
      }
      return
    }
    // Guard instanceof against arrow functions as they don't have a prototype.
    // Check for matching Error classes.
  } else if (expected.prototype !== undefined && actual instanceof expected) {
    return
  } else if (Object.prototype.isPrototypeOf.call(Error, expected)) {
    if (!message) {
      generatedMessage = true
      message = `The error is expected to be an instance of "${expected.name}". Received `
      if (isError(actual)) {
        const actualName = actual.constructor?.name || actual.name
        if (expected.name === actualName) {
          message += 'an error with identical name but a different prototype.'
        } else {
          message += `"${actualName}"`
        }
        if (actual.message) {
          message += `\n\nError message:\n\n${actual.message}`
        }
      } else {
        message += `"${inspect(actual, { depth: -1 })}"`
      }
    }
    throwError = true
  } else {
    // Check validation functions return value.
    const res = expected.call({}, actual)
    if (res !== true) {
      if (!message) {
        generatedMessage = true
        const fnName = expected.name ? `"${expected.name}" ` : ''
        message = `The ${fnName}validation function is expected to return "true". Received ${inspect(res)}`

        if (isError(actual)) {
          message += `\n\nCaught error:\n\n${actual}`
        }
      }
      throwError = true
    }
  }

  if (throwError) {
    const err = new AssertionError({
      actual,
      expected,
      message,
      operator: name,
      stackStartFn: fn,
    })
    err.generatedMessage = generatedMessage
    throw err
  }
}

function getActual(fn) {
  if (typeof fn !== 'function') {
    throw codedError(
      TypeError,
      'ERR_INVALID_ARG_TYPE',
      `The "fn" argument must be of type function. Received ${inspect(fn)}`
    )
  }
  try {
    fn()
  } catch (e) {
    return e
  }
  return NO_EXCEPTION_SENTINEL
}

function checkIsPromise(obj) {
  // Accept native ES6 promises and promises that are implemented in a similar
  // way. Do not accept thenables that use a function as `obj` and that have no
  // `catch` handler.
  return (
    isPromise(obj) ||
    (obj !== null &&
      typeof obj === 'object' &&
      typeof obj.then === 'function' &&
      typeof obj.catch === 'function')
  )
}

async function waitForActual(promiseFn) {
  let resultPromise
  if (typeof promiseFn === 'function') {
    // Return a rejected promise if `promiseFn` throws synchronously.
    resultPromise = promiseFn()
    // Fail in case no promise is returned.
    if (!checkIsPromise(resultPromise)) {
      throw codedError(
        TypeError,
        'ERR_INVALID_RETURN_VALUE',
        `Expected instance of Promise to be returned from the "promiseFn" function but got ${inspect(resultPromise)}.`
      )
    }
  } else if (checkIsPromise(promiseFn)) {
    resultPromise = promiseFn
  } else {
    throw codedError(
      TypeError,
      'ERR_INVALID_ARG_TYPE',
      `The "promiseFn" argument must be of type function or an instance of Promise. Received ${inspect(promiseFn)}`
    )
  }

  try {
    await resultPromise
  } catch (e) {
    return e
  }
  return NO_EXCEPTION_SENTINEL
}

const invalidErrorArg = (error) =>
  codedError(
    TypeError,
    'ERR_INVALID_ARG_TYPE',
    `The "error" argument must be of type function or an instance of Error, RegExp, or Object. Received ${inspect(error)}`
  )

// `stackStartFn.name` isn't an option for the operator, bundlers rename functions.
function expectsError(stackStartFn, name, actual, ...args) {
  let [error, message] = args
  if (typeof error === 'string') {
    if (args.length === 2) {
      throw invalidErrorArg(error)
    }
    if (typeof actual === 'object' && actual !== null) {
      if (actual.message === error) {
        throw codedError(
          TypeError,
          'ERR_AMBIGUOUS_ARGUMENT',
          `The "error/message" argument is ambiguous. The error message "${actual.message}" is identical to the message.`
        )
      }
    } else if (actual === error) {
      throw codedError(
        TypeError,
        'ERR_AMBIGUOUS_ARGUMENT',
        `The "error/message" argument is ambiguous. The error "${actual}" is identical to the message.`
      )
    }
    message = error
    error = undefined
  } else if (
    error != null &&
    typeof error !== 'object' &&
    typeof error !== 'function'
  ) {
    throw invalidErrorArg(error)
  }

  if (actual === NO_EXCEPTION_SENTINEL) {
    let details = ''
    if (error?.name) {
      details += ` (${error.name})`
    }
    details += message ? `: ${message}` : '.'
    const fnType = name === 'rejects' ? 'rejection' : 'exception'
    innerFail({
      actual: undefined,
      expected: error,
      operator: name,
      message: `Missing expected ${fnType}${details}`,
      stackStartFn,
    })
  }

  if (!error) {
    return
  }

  expectedException(actual, error, message, stackStartFn, name)
}

function hasMatchingError(actual, expected) {
  if (typeof expected !== 'function') {
    if (isRegExp(expected)) {
      return expected.exec(String(actual)) !== null
    }
    throw codedError(
      TypeError,
      'ERR_INVALID_ARG_TYPE',
      `The "expected" argument must be of type function or an instance of RegExp. Received ${inspect(expected)}`
    )
  }
  // Guard instanceof against arrow functions as they don't have a prototype.
  if (expected.prototype !== undefined && actual instanceof expected) {
    return true
  }
  if (Object.prototype.isPrototypeOf.call(Error, expected)) {
    return false
  }
  return expected.call({}, actual) === true
}

function expectsNoError(stackStartFn, name, actual, error, message) {
  if (actual === NO_EXCEPTION_SENTINEL) {
    return
  }

  if (typeof error === 'string') {
    message = error
    error = undefined
  }

  if (!error || hasMatchingError(actual, error)) {
    const details = message ? `: ${message}` : '.'
    const fnType = name === 'doesNotReject' ? 'rejection' : 'exception'
    innerFail({
      actual,
      expected: error,
      operator: name,
      message: `Got unwanted ${fnType}${details}\nActual message: "${actual?.message}"`,
      stackStartFn,
    })
  }
  throw actual
}

Assert.prototype.throws = function throws(promiseFn, ...args) {
  expectsError(throws, 'throws', getActual(promiseFn), ...args)
}

Assert.prototype.rejects = async function rejects(promiseFn, ...args) {
  expectsError(rejects, 'rejects', await waitForActual(promiseFn), ...args)
}

Assert.prototype.doesNotThrow = function doesNotThrow(fn, ...args) {
  expectsNoError(doesNotThrow, 'doesNotThrow', getActual(fn), ...args)
}

Assert.prototype.doesNotReject = async function doesNotReject(fn, ...args) {
  expectsNoError(
    doesNotReject,
    'doesNotReject',
    await waitForActual(fn),
    ...args
  )
}

Assert.prototype.ifError = function ifError(err) {
  if (err !== null && err !== undefined) {
    let message = 'ifError got unwanted exception: '
    if (typeof err === 'object' && typeof err.message === 'string') {
      if (err.message.length === 0 && err.constructor) {
        message += err.constructor.name
      } else {
        message += err.message
      }
    } else {
      message += inspect(err)
    }

    throw new AssertionError({
      actual: err,
      expected: null,
      operator: 'ifError',
      message,
      stackStartFn: ifError,
    })
  }
}

function internalMatch(string, regexp, message, fn, name) {
  if (!isRegExp(regexp)) {
    throw codedError(
      TypeError,
      'ERR_INVALID_ARG_TYPE',
      `The "regexp" argument must be an instance of RegExp. Received ${inspect(regexp)}`
    )
  }
  const match = name === 'match'
  if (typeof string !== 'string' || (regexp.exec(string) !== null) !== match) {
    if (message instanceof Error) {
      throw message
    }

    const generatedMessage = !message

    message ||=
      typeof string === 'string'
        ? `${
            match
              ? 'The input did not match the regular expression '
              : 'The input was expected to not match the regular expression '
          }${inspect(regexp)}. Input:\n\n${inspect(string)}\n`
        : `The "string" argument must be of type string. Received type ${typeof string} (${inspect(string)})`
    const err = new AssertionError({
      actual: string,
      expected: regexp,
      message,
      operator: name,
      stackStartFn: fn,
    })
    err.generatedMessage = generatedMessage
    throw err
  }
}

Assert.prototype.match = function match(string, regexp, message) {
  internalMatch(string, regexp, message, match, 'match')
}

Assert.prototype.doesNotMatch = function doesNotMatch(string, regexp, message) {
  internalMatch(string, regexp, message, doesNotMatch, 'doesNotMatch')
}

/**
 * Deprecated in Node.js and not implemented, using it throws.
 */
export class CallTracker {
  constructor() {
    throw new Error(
      'node:assert CallTracker is not supported by playwright-test/taps/node-assert'
    )
  }
}

const METHODS = [
  'fail',
  'equal',
  'notEqual',
  'deepEqual',
  'notDeepEqual',
  'deepStrictEqual',
  'notDeepStrictEqual',
  'strictEqual',
  'notStrictEqual',
  'partialDeepStrictEqual',
  'match',
  'doesNotMatch',
  'throws',
  'rejects',
  'doesNotThrow',
  'doesNotReject',
  'ifError',
]

/**
 * The shape of `node:assert`, with `.strict` for the one of `node:assert/strict`.
 */
export function assert(...args) {
  innerOk(assert, args.length, ...args)
}

assert.ok = assert
assert.AssertionError = AssertionError
assert.CallTracker = CallTracker
for (const name of METHODS) {
  assert[name] = Assert.prototype[name]
}

function strict(...args) {
  innerOk(strict, args.length, ...args)
}

assert.strict = Object.assign(strict, assert, {
  equal: assert.strictEqual,
  deepEqual: assert.deepStrictEqual,
  notEqual: assert.notStrictEqual,
  notDeepEqual: assert.notDeepStrictEqual,
})
assert.strict.ok = strict
assert.strict.Assert = Assert
assert.strict.strict = assert.strict
assert.Assert = Assert
