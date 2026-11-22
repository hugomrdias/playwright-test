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

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const HEX_CLOSE = '\u001B[39m'

/**
 * Parse a validated `#RGB` or `#RRGGBB` string to `[r, g, b]`.
 *
 * @param {string} hex
 */
function parseHexColor(hex) {
  if (hex.length === 4) {
    return [
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
      Number.parseInt(hex[3] + hex[3], 16),
    ]
  }
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

/**
 * The `process` of bundles is the polyfill esbuild injects for the free
 * identifier, `globalThis.process` isn't there in browsers.
 */
function runtimeProcess() {
  return typeof process === 'undefined' ? undefined : process
}

/**
 * Whether `styleText` should emit ANSI codes for `stream` under `env`, matching
 * Node.js's `shouldColorize` / `tty.WriteStream.prototype.getColorDepth`.
 *
 * @param {any} stream
 */
function shouldColorize(stream) {
  const env = runtimeProcess()?.env
  if (env?.FORCE_COLOR !== undefined) {
    const value = env.FORCE_COLOR
    return (
      value === '' ||
      value === '1' ||
      value === '2' ||
      value === '3' ||
      value === 'true'
    )
  }
  if (!stream?.isTTY) {
    return false
  }
  if (typeof stream.getColorDepth === 'function') {
    return stream.getColorDepth() > 1
  }
  return true
}

/**
 * Format text with ANSI SGR escape sequences, matching `node:util`'s `styleText`.
 *
 * @param {string | string[]} format
 * @param {string} text
 * @param {{ stream?: any, validateStream?: boolean }} [options]
 */
export function styleText(format, text, options) {
  if (typeof text !== 'string') {
    throw new codes.ERR_INVALID_ARG_TYPE('text', 'string', text)
  }
  if (
    options !== undefined &&
    (options === null || typeof options !== 'object' || Array.isArray(options))
  ) {
    throw new codes.ERR_INVALID_ARG_TYPE('options', 'Object', options)
  }
  const validateStream = options?.validateStream ?? true
  if (typeof validateStream !== 'boolean') {
    throw new codes.ERR_INVALID_ARG_TYPE(
      'options.validateStream',
      'boolean',
      validateStream
    )
  }

  const skipColorize =
    validateStream &&
    !shouldColorize(options?.stream ?? runtimeProcess()?.stdout)
  const formatArray = Array.isArray(format) ? format : [format]

  let openCodes = ''
  let closeCodes = ''
  let processedText = text

  for (const key of formatArray) {
    if (key === 'none') {
      continue
    }
    if (typeof key === 'string' && key[0] === '#') {
      if (!HEX_COLOR_RE.test(key)) {
        throw new codes.ERR_INVALID_ARG_VALUE(
          'format',
          key,
          'must be a valid hex color (#RGB or #RRGGBB)'
        )
      }
      if (skipColorize) {
        continue
      }
      const [r, g, b] = parseHexColor(key)
      const open = `\u001B[38;2;${r};${g};${b}m`
      openCodes += open
      closeCodes = HEX_CLOSE + closeCodes
      if (processedText.includes(HEX_CLOSE)) {
        processedText = processedText.replaceAll(HEX_CLOSE, open)
      }
      continue
    }
    const pair = inspect.colors[key]
    if (!pair) {
      throw new codes.ERR_INVALID_ARG_VALUE(
        'format',
        key,
        `must be one of: ${Object.getOwnPropertyNames(inspect.colors)
          .map((name) => `'${name}'`)
          .join(', ')}`
      )
    }
    if (skipColorize) {
      continue
    }
    const open = `\u001B[${pair[0]}m`
    const close = `\u001B[${pair[1]}m`
    const replace = pair[1] === 22 ? close + open : open
    openCodes += open
    closeCodes = close + closeCodes
    if (processedText.includes(close)) {
      processedText = processedText.replaceAll(close, replace)
    }
  }

  if (skipColorize) {
    return text
  }
  return `${openCodes}${processedText}${closeCodes}`
}

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
  const nodeDebug =
    typeof process === 'undefined' ? '' : (process.env?.NODE_DEBUG ?? '')
  const enabled =
    nodeDebug !== '' &&
    nodeDebug
      .split(',')
      .some((pattern) =>
        new RegExp(
          `^${pattern.replaceAll(/[|\\{}()[\]^$+?.]/g, '\\$&').replaceAll('*', '.*')}$`,
          'i'
        ).test(section)
      )
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
  styleText,
  TextDecoder,
  TextEncoder,
  toUSVString,
  types,
}
