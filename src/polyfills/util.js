// @ts-nocheck
/** biome-ignore-all lint/suspicious/noConsole: `util.log` and `util.debuglog` print */
/**
 * `node:util` for browsers, bundles resolve `util` to this file. `inspect` and `format`
 * are the ones from Node.js, what's specific to Node.js isn't here so using it fails
 * when bundling instead of when running.
 */
import { codes } from '../vendor/node-errors.js'
import {
  format,
  formatWithOptions,
  inspect,
  stripVTControlCharacters,
} from '../vendor/node-inspect.js'
import { isDeepStrictEqual as deepStrictEqual } from './comparisons.js'
import * as types from './types.js'

export { format, formatWithOptions, inspect, stripVTControlCharacters, types }

export const isDeepStrictEqual = (a, b) => deepStrictEqual(a, b)

const kCustomPromisify = Symbol.for('nodejs.util.promisify.custom')

/**
 * @param {Function} original
 */
export function promisify(original) {
  if (typeof original !== 'function') {
    throw new codes.ERR_INVALID_ARG_TYPE('original', 'Function', original)
  }
  if (original[kCustomPromisify]) {
    return original[kCustomPromisify]
  }
  function fn(...args) {
    return new Promise((resolve, reject) => {
      Reflect.apply(original, this, [
        ...args,
        (err, value) => (err ? reject(err) : resolve(value)),
      ])
    })
  }
  Object.setPrototypeOf(fn, Object.getPrototypeOf(original))
  Object.defineProperty(fn, kCustomPromisify, {
    value: fn,
    enumerable: false,
    writable: false,
    configurable: true,
  })
  return Object.defineProperties(fn, Object.getOwnPropertyDescriptors(original))
}
promisify.custom = kCustomPromisify

/**
 * @param {Function} original
 */
export function callbackify(original) {
  if (typeof original !== 'function') {
    throw new codes.ERR_INVALID_ARG_TYPE('original', 'Function', original)
  }
  function callbackified(...args) {
    const callback = args.pop()
    if (typeof callback !== 'function') {
      throw new codes.ERR_INVALID_ARG_TYPE(
        'last argument',
        'Function',
        callback
      )
    }
    Reflect.apply(original, this, args).then(
      (value) => queueMicrotask(() => callback(null, value)),
      (err) => {
        // Error-first callbacks would read a falsy reason as a success
        const reason = err || new codes.ERR_FALSY_VALUE_REJECTION(err)
        queueMicrotask(() => callback(reason))
      }
    )
  }
  const descriptors = Object.getOwnPropertyDescriptors(original)
  if (typeof descriptors.length.value === 'number') {
    descriptors.length.value++
  }
  if (typeof descriptors.name.value === 'string') {
    descriptors.name.value += 'Callbackified'
  }
  return Object.defineProperties(callbackified, descriptors)
}

/**
 * @param {Function} ctor
 * @param {Function} superCtor
 */
export function inherits(ctor, superCtor) {
  Object.defineProperty(ctor, 'super_', {
    value: superCtor,
    writable: true,
    configurable: true,
  })
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype)
}

/**
 * @param {Function} fn
 * @param {string} message
 */
export function deprecate(fn, message) {
  let warned = false
  return function deprecated(...args) {
    if (!warned) {
      warned = true
      console.warn(`DeprecationWarning: ${message}`)
    }
    return new.target
      ? Reflect.construct(fn, args, new.target)
      : Reflect.apply(fn, this, args)
  }
}

/**
 * @param {string} section
 */
export function debuglog(section) {
  const enabled = new RegExp(
    `(^|,)${section.replaceAll(/[|\\{}()[\]^$+?.]/g, '\\$&').replaceAll('*', '.*')}($|,)`,
    'i'
  ).test(globalThis.process?.env?.NODE_DEBUG ?? '')
  const log = (...args) => {
    if (enabled) {
      console.error(`${section.toUpperCase()}: ${format(...args)}`)
    }
  }
  log.enabled = enabled
  return log
}
export const debug = debuglog

export function log(...args) {
  console.log(format(...args))
}

/**
 * @param {string | USVString} value
 */
export const toUSVString = (value) => String(value).toWellFormed()

export const _extend = (target, source) =>
  source === null || typeof source !== 'object'
    ? target
    : Object.assign(target, source)

export const { TextDecoder, TextEncoder } = globalThis

// Removed from Node.js but they were in the `util` npm package this replaces.
export const isArray = Array.isArray
export const isBoolean = (v) => typeof v === 'boolean'
export const isBuffer = (v) => v?.constructor?.isBuffer?.(v) === true
export const isDate = types.isDate
export const isError = types.isNativeError
export const isFunction = (v) => typeof v === 'function'
export const isNull = (v) => v === null
export const isNullOrUndefined = (v) => v === null || v === undefined
export const isNumber = (v) => typeof v === 'number'
export const isObject = (v) => v !== null && typeof v === 'object'
export const isPrimitive = (v) =>
  v === null || (typeof v !== 'object' && typeof v !== 'function')
export const isRegExp = types.isRegExp
export const isString = (v) => typeof v === 'string'
export const isSymbol = (v) => typeof v === 'symbol'
export const isUndefined = (v) => v === undefined

export default {
  _extend,
  callbackify,
  debug,
  debuglog,
  deprecate,
  format,
  formatWithOptions,
  inherits,
  inspect,
  isArray,
  isBoolean,
  isBuffer,
  isDate,
  isDeepStrictEqual,
  isError,
  isFunction,
  isNull,
  isNullOrUndefined,
  isNumber,
  isObject,
  isPrimitive,
  isRegExp,
  isString,
  isSymbol,
  isUndefined,
  log,
  promisify,
  stripVTControlCharacters,
  TextDecoder,
  TextEncoder,
  toUSVString,
  types,
}
