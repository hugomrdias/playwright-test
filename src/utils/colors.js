/**
 * Terminal color detection and formatting backed directly by `node:util`'s
 * `styleText`, aligned with Node.js color precedence
 * (`tty.WriteStream.prototype.getColorDepth`).
 */
import { styleText } from 'node:util'

/**
 * @typedef {'bold' | 'dim' | 'red' | 'green' | 'yellow' | 'blue' | 'gray'} ColorName
 *
 * @typedef {object} Colors
 * @property {boolean} enabled
 * @property {(text: string) => string} bold
 * @property {(text: string) => string} dim
 * @property {(text: string) => string} red
 * @property {(text: string) => string} green
 * @property {(text: string) => string} yellow
 * @property {(text: string) => string} blue
 * @property {(text: string) => string} gray
 */

const NO_VALIDATE = { validateStream: false }

/**
 * @param {ColorName} style
 */
const makeStyle =
  (style) =>
  /** @param {string} text */
  (text) =>
    styleText(style, String(text), NO_VALIDATE)

/** @param {string} text */
const identity = (text) => String(text)

const styled = {
  bold: makeStyle('bold'),
  dim: makeStyle('dim'),
  red: makeStyle('red'),
  green: makeStyle('green'),
  yellow: makeStyle('yellow'),
  blue: makeStyle('blue'),
  gray: makeStyle('gray'),
}

const plain = {
  bold: identity,
  dim: identity,
  red: identity,
  green: identity,
  yellow: identity,
  blue: identity,
  gray: identity,
}

/**
 * Whether `FORCE_COLOR` asks for colors, matching Node.js's
 * `tty.WriteStream.prototype.getColorDepth`.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function isColorForced(
  env = typeof process === 'undefined' ? undefined : process.env
) {
  const value = env?.FORCE_COLOR
  return (
    value === '' ||
    value === '1' ||
    value === '2' ||
    value === '3' ||
    value === 'true'
  )
}

/**
 * Whether terminal colors should be enabled.
 *
 * Precedence matches Node.js:
 * 1. `FORCE_COLOR` when set (`''`, `'1'`, `'2'`, `'3'`, `'true'` enable; any other value disables).
 * 2. `minimal` mode (AI agents) disables colors unless forced above.
 * 3. Non-empty `NODE_DISABLE_COLORS`, non-empty `NO_COLOR`, or `TERM=dumb` disable colors.
 * 4. Otherwise enabled for TTYs, or by default in non-Node runtimes (browsers, workers, workerd).
 *
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env]
 * @param {boolean} [options.isTTY]
 * @param {boolean} [options.minimal]
 */
export function supportsColor({
  env = typeof process === 'undefined' ? undefined : process.env,
  isTTY,
  minimal = false,
} = {}) {
  if (env?.FORCE_COLOR !== undefined) {
    return isColorForced(env)
  }
  if (minimal) {
    return false
  }
  if (
    (env?.NODE_DISABLE_COLORS !== undefined &&
      env.NODE_DISABLE_COLORS !== '') ||
    (env?.NO_COLOR !== undefined && env.NO_COLOR !== '') ||
    env?.TERM === 'dumb'
  ) {
    return false
  }
  if (isTTY !== undefined) {
    return Boolean(isTTY)
  }
  if (typeof process === 'undefined') {
    return true
  }
  const isNode =
    process.release?.name === 'node' &&
    globalThis.navigator?.userAgent !== 'Cloudflare-Workers'
  if (isNode) {
    return Boolean(process.stdout?.isTTY)
  }
  return process.stdout?.isTTY ?? true
}

/**
 * Create an isolated color formatter instance with no shared mutable state.
 *
 * @param {boolean} [enabled]
 * @returns {Colors}
 */
export function createColors(enabled = supportsColor()) {
  const fns = enabled ? styled : plain
  return {
    enabled,
    bold: fns.bold,
    dim: fns.dim,
    red: fns.red,
    green: fns.green,
    yellow: fns.yellow,
    blue: fns.blue,
    gray: fns.gray,
  }
}

/**
 * Default color formatter for the CLI and runner process.
 *
 * @type {Colors}
 */
export const colors = {
  enabled: supportsColor(),
  bold: (text) => (colors.enabled ? styled.bold(text) : String(text)),
  dim: (text) => (colors.enabled ? styled.dim(text) : String(text)),
  red: (text) => (colors.enabled ? styled.red(text) : String(text)),
  green: (text) => (colors.enabled ? styled.green(text) : String(text)),
  yellow: (text) => (colors.enabled ? styled.yellow(text) : String(text)),
  blue: (text) => (colors.enabled ? styled.blue(text) : String(text)),
  gray: (text) => (colors.enabled ? styled.gray(text) : String(text)),
}
