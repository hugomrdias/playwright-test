import kleur from 'kleur'
import { AssertionError, strict } from '../node/assert.js'
import { compare, formatObj } from './utils.js'

/**
 * Our `node:assert/strict`, see `src/node/assert.js`, and three asserts of our own.
 */
export * from '../node/assert.js'

/**
 * @typedef {import('./types.js').TypeMap} TypeMap
 */

/**
 * Assert that actual is a subset of expected.
 *
 * @example
 * ```js
 * // Supports compare functions
 * subset({ a: 1, b: 2 }, { b: 2, a: (actual) => actual === 1 })
 * ```
 *
 * @template T
 * @param {unknown} actual
 * @param {T} expected
 * @param {string} [msg]
 *
 * @returns {asserts actual is Partial<T>} - returns true if actual is a subset of expected
 */
export function subset(actual, expected, msg) {
  const pass = compare(expected, actual)
  if (!pass) {
    throw new AssertionError({
      message:
        msg ||
        `Expected a subset of actual:
${kleur.green('+ actual')} ${kleur.red('- expected')}

${kleur.green('+')} ${formatObj(actual)}
${kleur.red('-')} ${formatObj(expected)}`,
      actual,
      expected,
      operator: 'subset',
      stackStartFn: subset,
    })
  }
}

/**
 * Assert that actual is the same type as expected.
 *
 * @template {keyof TypeMap} [T= keyof TypeMap]
 * @param {any} actual
 * @param {T} expected
 * @param {string} [msg]
 *
 * @returns {asserts actual is TypeMap[T]} - returns true if actual and expected are the same type
 */
export function type(actual, expected, msg) {
  const tmp = typeof actual
  if (tmp !== expected) {
    throw new AssertionError({
      message:
        msg ||
        `Expected type ${expected} but got ${tmp}
${kleur.red('Actual')} ${formatObj(actual)}`,
      actual,
      expected,
      operator: 'type',
      stackStartFn: type,
    })
  }
}

/**
 * Assert that actual is instance of expected.
 *
 * @template {Function} T extends Function
 * @param {any} actual
 * @param {T} expected
 * @param {string} [msg]
 *
 * @returns {asserts actual is T} - returns true if actual and expected are the same type
 */
export function instance(actual, expected, msg) {
  const name = `\`${expected.name || expected.constructor.name}\``
  if (!(actual instanceof expected)) {
    throw new AssertionError({
      message:
        msg ||
        `Expected type actual to be instance of ${name}
${kleur.red('Actual')} ${formatObj(actual)}`,
      actual,
      expected,
      operator: 'instance',
      stackStartFn: instance,
    })
  }
}

/** @type {import('./types.js').Assert} */
export const assert = { ...strict, subset, type, instance }
