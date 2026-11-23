import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { isFrame, removeInternalFrames } from './stack-frames.ts'

/**
 * A position in one of our bundles, in any browser's stack format. Matching the
 * text of the position instead of the frame covers `at fn (url:1:2)` and
 * `fn@url:1:2`. Mocha removes the page's url from V8 frames, leaving
 * `at fn (bundle-out.js:1:2)`. The server has them at its root.
 */
const POSITION =
  /(?<![\w./-])(?:[a-z][\w+.-]*:\/\/[^\s()/]+\/)?((?:bundle|sw)-out\.js):(\d+):(\d+)/g
const INLINE_MAP = 'sourceMappingURL=data:application/json;base64,'

// The filters of the test runners run in the page, where they only see bundles
const MOCHA = /[/\\]node_modules[/\\]mocha[/\\]/
const SRC = toSlashes(fileURLToPath(new URL('../', import.meta.url)))

function isInternal(file: string) {
  // What the runner bundles the tests from
  return MOCHA.test(file) || file.startsWith(SRC) || file.endsWith('<stdin>')
}

/**
 * The page can print a stack trace inside anything, like a JSON string, where
 * the backslashes of Windows paths would be escapes. It's a valid path without
 * them, and it's what reporters print in node mode.
 */
function toSlashes(file: string) {
  return file.split(path.sep).join('/')
}

function resolveSource(dir: string, source: string) {
  if (source.startsWith('file:')) {
    return toSlashes(fileURLToPath(source))
  }
  return /^[a-z][\w+.-]*:/i.test(source)
    ? source
    : toSlashes(path.resolve(dir, source))
}

/**
 * Read the source map of a bundle, inline or in a file next to it
 */
function readSourceMap(file: string) {
  try {
    const code = readFileSync(file, 'utf8')
    const start = code.lastIndexOf(INLINE_MAP)
    return new TraceMap(
      start === -1
        ? readFileSync(`${file}.map`, 'utf8')
        : Buffer.from(
            code.slice(start + INLINE_MAP.length).trim(),
            'base64'
          ).toString()
    )
  } catch {
    // Built without source maps, positions stay in the bundle
    return null
  }
}

/**
 * Map positions in the text coming out of the browser back to the source files.
 * Browsers have no API to do this for `Error.stack`, and only V8 has a hook to
 * do it in the page.
 *
 * @param dir - directory with the bundles
 */
export function createStackMapper(dir: string) {
  const maps: Map<string, TraceMap | null> = new Map()

  function load(name: string) {
    let map = maps.get(name)
    if (map === undefined) {
      map = readSourceMap(path.join(dir, name))
      maps.set(name, map)
    }
    return map
  }

  function mapString(text: string) {
    if (!text.includes('-out.js:')) {
      return text
    }

    const lines = text.split('\n').map((line) => {
      let internal = false
      const mapped = line.replace(POSITION, (position, name, l, c) => {
        const map = load(name)
        if (!map) {
          return position
        }
        const original = originalPositionFor(map, {
          line: Number(l),
          // Browsers count columns from 1, source maps from 0
          column: Math.max(Number(c) - 1, 0),
        })
        if (!original.source) {
          // Helpers esbuild adds to the bundle have no source
          internal = true
          return position
        }
        const file = resolveSource(dir, original.source)
        internal = isInternal(file)
        return `${file}:${original.line}:${original.column + 1}`
      })
      return { text: mapped, internal: internal && isFrame(line) }
    })
    return removeInternalFrames(lines).join('\n')
  }

  /**
   * Map text written as bytes, anything else has to stay exactly as it is.
   */
  function mapBytes(bytes: Uint8Array) {
    let text: string
    try {
      text = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes)
    } catch {
      return bytes
    }
    const mapped = mapString(text)
    return mapped === text ? bytes : new TextEncoder().encode(mapped)
  }

  return {
    /**
     * Forget the source maps, the bundles were built again
     */
    reset() {
      maps.clear()
    },

    /**
     * Map a string, text written as bytes, or the strings in a value logged in
     * the browser. Those are copies only used for printing, so they are changed
     * in place.
     */
    map<T>(value: T): T {
      return mapValue(value, new WeakSet()) as T
    },
  }

  /**
   * @param seen - logged values can have cycles
   */
  function mapValue(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === 'string') {
      return mapString(value)
    }
    if (value instanceof Uint8Array) {
      return mapBytes(value)
    }
    if (typeof value !== 'object' || value === null || seen.has(value)) {
      return value
    }
    seen.add(value)

    if (value instanceof Error) {
      if (value.stack) {
        value.stack = mapString(value.stack)
      }
    } else if (!Array.isArray(value) && !isPlainObject(value)) {
      return value
    }
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      record[key] = mapValue(record[key], seen)
    }
    return value
  }
}

function isPlainObject(value: object) {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
