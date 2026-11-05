// @ts-nocheck
/**
 * What the Node.js modules in `src/vendor` need from Node.js internals, with what's
 * possible in a browser. There's no way to read the state of a promise, the entries
 * of an iterator or a WeakMap without changing them, or to detect a proxy.
 */
import * as types from './types.js'

export const isError = (e) => types.isNativeError(e) || e instanceof Error

export const colors = {
  blue: '',
  green: '',
  white: '',
  red: '',
  gray: '',
  clear: '',
  reset: '',
  hasColors: false,
  shouldColorize: () => false,
  refresh: () => undefined,
}

let codes
/** Set by `src/vendor/node-errors.js`, which needs `inspect` that needs this file. */
export const registerCodes = (value) => {
  codes = value
}

function invalidArgType(name, expected, value) {
  if (codes) {
    return new codes.ERR_INVALID_ARG_TYPE(name, expected, value)
  }
  const err = new TypeError(
    `The "${name}" argument must be of type ${expected}`
  )
  err.code = 'ERR_INVALID_ARG_TYPE'
  return err
}

const kValidateObjectAllowArray = 1

export function validateObject(value, name, options = 0) {
  if (
    value === null ||
    typeof value !== 'object' ||
    (Array.isArray(value) && options !== kValidateObjectAllowArray)
  ) {
    throw invalidArgType(name, 'Object', value)
  }
}

function validateString(value, name) {
  if (typeof value !== 'string') {
    throw invalidArgType(name, 'string', value)
  }
}

export function isErrorStackTraceLimitWritable() {
  if (typeof Error.stackTraceLimit !== 'number') {
    return false
  }
  const desc = Object.getOwnPropertyDescriptor(Error, 'stackTraceLimit')
  if (desc === undefined) {
    return Object.isExtensible(Error)
  }
  return Object.hasOwn(desc, 'writable')
    ? desc.writable
    : desc.set !== undefined
}

let stackOverflow

function isStackOverflowError(err) {
  if (stackOverflow === undefined) {
    try {
      const overflow = () => overflow()
      overflow()
    } catch (e) {
      stackOverflow = e
    }
  }
  return (
    err &&
    err.name === stackOverflow.name &&
    err.message === stackOverflow.message
  )
}

const kAllProperties = 0
const kOnlyEnumerable = 2

function getOwnNonIndexProperties(value, filter) {
  const isIndex = (key) => {
    const index = Number(key)
    return (
      Number.isInteger(index) &&
      index >= 0 &&
      index < 2 ** 32 - 1 &&
      String(index) === key
    )
  }
  return Reflect.ownKeys(value).filter((key) => {
    if (typeof key === 'string' && isIndex(key)) {
      return false
    }
    return (
      filter === kAllProperties ||
      Object.prototype.propertyIsEnumerable.call(value, key)
    )
  })
}

function join(output, separator) {
  return output.join(separator)
}

const colorRegExp = new RegExp(`${String.fromCharCode(27)}\\[\\d\\d?m`, 'g')

const modules = {
  'internal/assert': (value, message) => {
    if (!value) {
      throw new Error(message ?? 'Internal assertion failed')
    }
  },
  'internal/bootstrap/realm': { BuiltinModule: { exists: () => false } },
  'internal/errors': { isStackOverflowError },
  'internal/url': { URL: globalThis.URL },
  'internal/util': {
    customInspectSymbol: Symbol.for('nodejs.util.inspect.custom'),
    isError,
    join,
    removeColors: (str) => str.replace(colorRegExp, ''),
  },
  'internal/util/types': types,
  'internal/validators': {
    kValidateObjectAllowArray,
    validateObject,
    validateString,
  },
}

export const require = (id) => modules[id]

export const internalBinding = (name) => {
  if (name === 'config') {
    return { hasIntl: false }
  }
  return {
    constants: {
      ALL_PROPERTIES: kAllProperties,
      ONLY_ENUMERABLE: kOnlyEnumerable,
      kPending: 0,
      kRejected: 2,
    },
    getOwnNonIndexProperties,
    getPromiseDetails: () => [0],
    getProxyDetails: () => undefined,
    previewEntries: (_value, isIterator) => (isIterator ? [[], false] : []),
    getConstructorName: (value) =>
      Object.prototype.toString.call(value).slice(8, -1),
    getExternalValue: () => 0n,
  }
}
