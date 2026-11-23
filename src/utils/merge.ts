export interface MergeConfig {
  /** Concatenate arrays instead of replacing them. */
  concatArrays?: boolean
  /** Skip `undefined` values instead of setting them. */
  ignoreUndefined?: boolean
}

type PlainObject = Record<PropertyKey, unknown>

/**
 * An object literal, or one made with `Object.create(null)`. Arrays, class
 * instances, functions and the like are not.
 */
export function isPlainObject(value: unknown): value is PlainObject {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

/** Own enumerable keys, symbols included. */
function keys(value: object) {
  return Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  )
}

/**
 * Set a property as data, so a `__proto__` key stays a key and doesn't set
 * the prototype.
 */
function define(target: object, key: PropertyKey, value: unknown) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

/**
 * A deep copy of arrays and plain objects, everything else is kept as it is.
 */
function clone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(clone)
  }
  if (isPlainObject(value)) {
    const copy =
      Object.getPrototypeOf(value) === null ? Object.create(null) : {}
    for (const key of keys(value)) {
      define(copy, key, clone(value[key]))
    }
    return copy
  }
  return value
}

/**
 * `target` then `source`, without the holes of sparse arrays. Spreading would
 * turn them into `undefined`, and esbuild rejects an `undefined` plugin.
 */
function concat(target: unknown[], source: unknown[]) {
  const result: unknown[] = []
  for (const array of [target, source]) {
    for (let index = 0; index < array.length; index++) {
      if (Object.hasOwn(array, index)) {
        // `target` is already a copy
        result.push(array === target ? array[index] : clone(array[index]))
      }
    }
  }
  return result
}

/**
 * Merge `source` into `target`, which is already a copy and can be changed.
 */
function mergeInto(
  target: unknown,
  source: unknown,
  config: MergeConfig
): unknown {
  if (config.concatArrays && Array.isArray(target) && Array.isArray(source)) {
    return concat(target, source)
  }
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return clone(source)
  }
  for (const key of keys(source)) {
    const value = source[key]
    if (value === undefined && config.ignoreUndefined) {
      continue
    }
    define(
      target,
      key,
      Object.hasOwn(target, key)
        ? mergeInto(target[key], value, config)
        : clone(value)
    )
  }
  return target
}

/**
 * A function that deep merges plain objects into a new one, later ones win.
 * Nested plain objects are merged, anything else is replaced, arrays too
 * unless `concatArrays`. The objects themselves are never changed, arrays and
 * plain objects are copied, other values (functions, class instances) are
 * shared. `undefined` arguments are skipped.
 *
 * @example
 * ```ts
 * const merge = createMerge({ ignoreUndefined: true })
 * merge({ a: { b: 1 } }, { a: { c: 2 } }, { a: undefined }) // { a: { b: 1, c: 2 } }
 * ```
 */
export function createMerge(config: MergeConfig = {}) {
  return function merge<T = PlainObject>(...objects: unknown[]): T {
    let result: unknown = {}
    for (const object of objects) {
      if (object === undefined) {
        continue
      }
      if (!isPlainObject(object)) {
        throw new TypeError(`\`${String(object)}\` is not a plain object`)
      }
      result = mergeInto(result, object, config)
    }
    return result as T
  }
}
