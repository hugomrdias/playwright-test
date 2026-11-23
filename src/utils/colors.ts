/**
 * Terminal color detection and formatting backed directly by `node:util`'s
 * `styleText`, aligned with Node.js color precedence
 * (`tty.WriteStream.prototype.getColorDepth`).
 */
import { styleText } from 'node:util'

export type ColorName =
  | 'bold'
  | 'dim'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'gray'

export interface Colors {
  enabled: boolean
  bold: (text: string) => string
  dim: (text: string) => string
  red: (text: string) => string
  green: (text: string) => string
  yellow: (text: string) => string
  blue: (text: string) => string
  gray: (text: string) => string
}

const NO_VALIDATE = { validateStream: false }

const makeStyle = (style: ColorName) => (text: string) =>
  styleText(style, String(text), NO_VALIDATE)

const identity = (text: string) => String(text)

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
 */
export function isColorForced(
  env: Record<string, string | undefined> | undefined = typeof process ===
  'undefined'
    ? undefined
    : process.env
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
 * 4. Otherwise on a stream/terminal, requires `isTTY` and `getColorDepth(env) > 1` when provided.
 *    In non-Node runtimes without a stdout stream (browsers, workers, workerd), defaults to true.
 */
export function supportsColor({
  env = typeof process === 'undefined' ? undefined : process.env,
  isTTY,
  minimal = false,
  stream,
}: {
  env?: Record<string, string | undefined>
  isTTY?: boolean
  minimal?: boolean
  stream?: {
    isTTY?: boolean
    getColorDepth?: (env?: Record<string, string | undefined>) => number
  }
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
  if (stream !== undefined) {
    const tty = isTTY ?? stream?.isTTY
    if (!tty) {
      return false
    }
    if (typeof stream?.getColorDepth === 'function') {
      return stream.getColorDepth(env) > 1
    }
    return true
  }
  if (isTTY !== undefined) {
    return Boolean(isTTY)
  }
  if (typeof process === 'undefined') {
    return true
  }
  const stdout = process.stdout
  const isNode =
    process.release?.name === 'node' &&
    globalThis.navigator?.userAgent !== 'Cloudflare-Workers'
  if (isNode) {
    if (!stdout?.isTTY) {
      return false
    }
    if (typeof stdout.getColorDepth === 'function') {
      return stdout.getColorDepth(env) > 1
    }
    return true
  }
  if (stdout?.isTTY === false) {
    return false
  }
  if (typeof stdout?.getColorDepth === 'function') {
    return stdout.getColorDepth(env) > 1
  }
  return true
}

/**
 * Create an isolated color formatter instance with no shared mutable state.
 */
export function createColors(enabled: boolean = supportsColor()): Colors {
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
 */
export const colors: Colors = {
  enabled: supportsColor(),
  bold: (text) => (colors.enabled ? styled.bold(text) : String(text)),
  dim: (text) => (colors.enabled ? styled.dim(text) : String(text)),
  red: (text) => (colors.enabled ? styled.red(text) : String(text)),
  green: (text) => (colors.enabled ? styled.green(text) : String(text)),
  yellow: (text) => (colors.enabled ? styled.yellow(text) : String(text)),
  blue: (text) => (colors.enabled ? styled.blue(text) : String(text)),
  gray: (text) => (colors.enabled ? styled.gray(text) : String(text)),
}
