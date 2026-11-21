import { strictEqual as is, throws } from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import { WriteStream } from 'node:tty'
import { styleText } from 'node:util'
import { process as browserProcess } from '../src/polyfills/process.js'
import { styleText as polyfillStyleText } from '../src/polyfills/util.js'
import {
  colors,
  createColors,
  isColorForced,
  supportsColor,
} from '../src/utils/colors.js'

describe('colors', () => {
  describe('isColorForced', () => {
    for (const value of ['', '1', '2', '3', 'true']) {
      it(`returns true for FORCE_COLOR=${JSON.stringify(value)}`, () => {
        is(isColorForced({ FORCE_COLOR: value }), true)
      })
    }

    for (const value of ['0', 'false', '4', 'yes', 'no', undefined]) {
      it(`returns false for FORCE_COLOR=${JSON.stringify(value)}`, () => {
        is(isColorForced({ FORCE_COLOR: value }), false)
      })
    }
  })

  describe('supportsColor', () => {
    it('enables colors for TTY when no disable env is set', () => {
      is(supportsColor({ env: { TERM: 'xterm-256color' }, isTTY: true }), true)
      is(supportsColor({ env: {}, isTTY: true }), true)
    })

    it('disables colors for non-TTY without FORCE_COLOR', () => {
      is(
        supportsColor({ env: { TERM: 'xterm-256color' }, isTTY: false }),
        false
      )
      is(supportsColor({ env: {}, isTTY: false }), false)
    })

    for (const value of ['', '1', '2', '3', 'true']) {
      it(`enables colors for FORCE_COLOR=${JSON.stringify(value)} even when non-TTY or TERM=dumb`, () => {
        is(supportsColor({ env: { FORCE_COLOR: value }, isTTY: false }), true)
        is(
          supportsColor({
            env: { FORCE_COLOR: value, TERM: 'dumb' },
            isTTY: false,
          }),
          true
        )
        is(
          supportsColor({
            env: { FORCE_COLOR: value, NO_COLOR: '1' },
            isTTY: false,
          }),
          true
        )
        is(
          supportsColor({
            env: { FORCE_COLOR: value, NODE_DISABLE_COLORS: '1' },
            isTTY: false,
          }),
          true
        )
      })
    }

    for (const value of ['0', 'false', 'invalid']) {
      it(`disables colors for FORCE_COLOR=${JSON.stringify(value)} even on a TTY`, () => {
        is(
          supportsColor({
            env: { FORCE_COLOR: value, TERM: 'xterm-256color' },
            isTTY: true,
          }),
          false
        )
      })
    }

    it('disables colors for non-empty NO_COLOR and ignores empty NO_COLOR', () => {
      is(
        supportsColor({
          env: { NO_COLOR: '1', TERM: 'xterm-256color' },
          isTTY: true,
        }),
        false
      )
      is(
        supportsColor({
          env: { NO_COLOR: '0', TERM: 'xterm-256color' },
          isTTY: true,
        }),
        false
      )
      is(
        supportsColor({
          env: { NO_COLOR: '', TERM: 'xterm-256color' },
          isTTY: true,
        }),
        true
      )
    })

    it('disables colors for non-empty NODE_DISABLE_COLORS and ignores empty value', () => {
      is(
        supportsColor({
          env: { NODE_DISABLE_COLORS: '1', TERM: 'xterm-256color' },
          isTTY: true,
        }),
        false
      )
      is(
        supportsColor({
          env: { NODE_DISABLE_COLORS: '0', TERM: 'xterm-256color' },
          isTTY: true,
        }),
        false
      )
      is(
        supportsColor({
          env: { NODE_DISABLE_COLORS: '', TERM: 'xterm-256color' },
          isTTY: true,
        }),
        true
      )
    })

    it('disables colors for TERM=dumb unless overridden by FORCE_COLOR', () => {
      is(supportsColor({ env: { TERM: 'dumb' }, isTTY: true }), false)
      is(
        supportsColor({
          env: { TERM: 'dumb', FORCE_COLOR: '1' },
          isTTY: false,
        }),
        true
      )
      is(
        supportsColor({
          env: { TERM: 'dumb', FORCE_COLOR: '0' },
          isTTY: true,
        }),
        false
      )
    })

    it('disables colors in minimal / AI agent mode unless FORCE_COLOR enables them', () => {
      is(
        supportsColor({
          env: { TERM: 'xterm-256color' },
          isTTY: true,
          minimal: true,
        }),
        false
      )
      is(
        supportsColor({
          env: { FORCE_COLOR: '1' },
          isTTY: false,
          minimal: true,
        }),
        true
      )
      is(
        supportsColor({
          env: { FORCE_COLOR: '1', TERM: 'dumb' },
          isTTY: false,
          minimal: true,
        }),
        true
      )
      is(
        supportsColor({
          env: { FORCE_COLOR: '0' },
          isTTY: true,
          minimal: true,
        }),
        false
      )
    })

    it('honors stream getColorDepth on TTYs (e.g. CI=1 or depth 1)', () => {
      is(
        supportsColor({
          env: { TERM: 'xterm-256color' },
          stream: { isTTY: true, getColorDepth: () => 1 },
        }),
        false
      )
      is(
        supportsColor({
          env: { TERM: 'xterm-256color' },
          stream: { isTTY: true, getColorDepth: () => 4 },
        }),
        true
      )
      const ciEnv = { CI: '1', TERM: 'xterm-256color' }
      is(
        supportsColor({
          env: ciEnv,
          stream: {
            isTTY: true,
            getColorDepth: WriteStream.prototype.getColorDepth,
          },
        }),
        WriteStream.prototype.getColorDepth(ciEnv) > 1
      )
      is(
        supportsColor({
          env: { ...ciEnv, FORCE_COLOR: '1' },
          stream: {
            isTTY: true,
            getColorDepth: WriteStream.prototype.getColorDepth,
          },
        }),
        true
      )
      is(
        supportsColor({
          env: { TERM: 'xterm-256color' },
          stream: { isTTY: false, getColorDepth: () => 8 },
        }),
        false
      )
    })

    it('matches Node.js WriteStream.prototype.hasColors precedence on TTY', () => {
      /** @type {Array<Record<string, string>>} */
      const envs = [
        { TERM: 'xterm-256color' },
        { TERM: 'dumb' },
        { TERM: 'dumb', FORCE_COLOR: '1' },
        { TERM: 'xterm-256color', NO_COLOR: '1' },
        { TERM: 'xterm-256color', NO_COLOR: '' },
        { TERM: 'xterm-256color', NODE_DISABLE_COLORS: '1' },
        { TERM: 'xterm-256color', NODE_DISABLE_COLORS: '' },
        { TERM: 'xterm-256color', FORCE_COLOR: '0' },
        { TERM: 'xterm-256color', FORCE_COLOR: 'false' },
        { TERM: 'xterm-256color', FORCE_COLOR: 'invalid' },
        { FORCE_COLOR: '1' },
        { FORCE_COLOR: '2' },
        { FORCE_COLOR: '3' },
        { FORCE_COLOR: 'true' },
        { FORCE_COLOR: '' },
        { NO_COLOR: '1', FORCE_COLOR: '1' },
        { NODE_DISABLE_COLORS: '1', FORCE_COLOR: '1' },
      ]

      for (const env of envs) {
        is(
          supportsColor({ env, isTTY: true }),
          WriteStream.prototype.hasColors(env),
          JSON.stringify(env)
        )
      }
    })
  })

  describe('createColors', () => {
    const styles = /** @type {const} */ ([
      'bold',
      'dim',
      'red',
      'green',
      'yellow',
      'blue',
      'gray',
    ])

    it('matches Node.js util.styleText SGR codes when enabled', () => {
      const c = createColors(true)
      is(c.enabled, true)
      for (const style of styles) {
        is(
          c[style]('hello'),
          styleText(style, 'hello', { validateStream: false }),
          style
        )
      }
    })

    it('returns plain strings when disabled', () => {
      const c = createColors(false)
      is(c.enabled, false)
      for (const style of styles) {
        is(c[style]('hello'), 'hello', style)
      }
    })

    it('handles nested close codes identically to util.styleText', () => {
      const c = createColors(true)
      is(
        c.red(`a ${c.blue('b')} c`),
        styleText(
          'red',
          `a ${styleText('blue', 'b', { validateStream: false })} c`,
          {
            validateStream: false,
          }
        )
      )
      is(
        c.bold(`a ${c.dim('b')} c`),
        styleText(
          'bold',
          `a ${styleText('dim', 'b', { validateStream: false })} c`,
          {
            validateStream: false,
          }
        )
      )
    })

    it('keeps instances isolated from the default colors object', () => {
      const prev = colors.enabled
      try {
        const on = createColors(true)
        const off = createColors(false)
        colors.enabled = false
        is(colors.red('x'), 'x')
        is(on.red('x'), '\u001B[31mx\u001B[39m')
        is(off.red('x'), 'x')
        colors.enabled = true
        is(colors.red('x'), '\u001B[31mx\u001B[39m')
        is(off.red('x'), 'x')
      } finally {
        colors.enabled = prev
      }
    })
  })

  describe('polyfill styleText', () => {
    it('matches Node.js util.styleText for all used styles and nested codes', () => {
      for (const style of /** @type {const} */ ([
        'bold',
        'dim',
        'red',
        'green',
        'yellow',
        'blue',
        'gray',
      ])) {
        is(
          polyfillStyleText(style, 'hello', { validateStream: false }),
          styleText(style, 'hello', { validateStream: false }),
          style
        )
      }
      is(
        polyfillStyleText(
          'red',
          `a ${polyfillStyleText('blue', 'b', { validateStream: false })} c`,
          { validateStream: false }
        ),
        styleText(
          'red',
          `a ${styleText('blue', 'b', { validateStream: false })} c`,
          { validateStream: false }
        )
      )
      is(
        polyfillStyleText(
          'bold',
          `a ${polyfillStyleText('dim', 'b', { validateStream: false })} c`,
          { validateStream: false }
        ),
        styleText(
          'bold',
          `a ${styleText('dim', 'b', { validateStream: false })} c`,
          { validateStream: false }
        )
      )
    })

    it('respects stream isTTY and env precedence when validateStream is true', () => {
      const savedForce = process.env.FORCE_COLOR
      const savedBrowserEnv = { ...browserProcess.env }
      const resetBrowserEnv = (/** @type {Record<string, string>} */ next) => {
        for (const k of Object.keys(browserProcess.env)) {
          delete browserProcess.env[k]
        }
        Object.assign(browserProcess.env, next)
      }
      try {
        delete process.env.FORCE_COLOR

        const monoTty = Object.assign(new PassThrough(), {
          isTTY: true,
          getColorDepth: () => 1,
        })
        const colorTty = Object.assign(new PassThrough(), {
          isTTY: true,
          getColorDepth: () => 4,
        })
        const nonTty = Object.assign(new PassThrough(), {
          isTTY: false,
          getColorDepth: () => 8,
        })

        is(polyfillStyleText('red', 'x', { stream: monoTty }), 'x')
        is(
          polyfillStyleText('red', 'x', { stream: colorTty }),
          '\u001B[31mx\u001B[39m'
        )
        is(polyfillStyleText('red', 'x', { stream: nonTty }), 'x')

        resetBrowserEnv({ TERM: 'xterm-256color' })
        is(
          polyfillStyleText('red', 'x', { stream: browserProcess.stdout }),
          '\u001B[31mx\u001B[39m'
        )

        resetBrowserEnv({ TERM: 'dumb' })
        is(
          polyfillStyleText('red', 'x', { stream: browserProcess.stdout }),
          'x'
        )

        resetBrowserEnv({ TERM: 'xterm-256color', NO_COLOR: '1' })
        is(
          polyfillStyleText('red', 'x', { stream: browserProcess.stdout }),
          'x'
        )

        resetBrowserEnv({ TERM: 'xterm-256color', NODE_DISABLE_COLORS: '1' })
        is(
          polyfillStyleText('red', 'x', { stream: browserProcess.stdout }),
          'x'
        )

        process.env.FORCE_COLOR = '1'
        is(
          polyfillStyleText('red', 'x', { stream: nonTty }),
          '\u001B[31mx\u001B[39m'
        )
        is(
          polyfillStyleText('red', 'x', { stream: monoTty }),
          '\u001B[31mx\u001B[39m'
        )
        is(
          polyfillStyleText('red', 'x', { stream: browserProcess.stdout }),
          '\u001B[31mx\u001B[39m'
        )
      } finally {
        if (savedForce === undefined) {
          delete process.env.FORCE_COLOR
        } else {
          process.env.FORCE_COLOR = savedForce
        }
        resetBrowserEnv(savedBrowserEnv)
      }
    })

    it('supports #RGB and #RRGGBB hex colors matching Node.js util.styleText', () => {
      const hasNativeHex = (() => {
        try {
          styleText(/** @type {any} */ ('#f80'), 'x', { validateStream: false })
          return true
        } catch {
          return false
        }
      })()

      /** @type {Array<[string, string]>} */
      const cases = [
        ['#f80', '\u001B[38;2;255;136;0mx\u001B[39m'],
        ['#F80', '\u001B[38;2;255;136;0mx\u001B[39m'],
        ['#ff8800', '\u001B[38;2;255;136;0mx\u001B[39m'],
        ['#000', '\u001B[38;2;0;0;0mx\u001B[39m'],
        ['#ffffff', '\u001B[38;2;255;255;255mx\u001B[39m'],
      ]
      for (const [hex, expected] of cases) {
        const actual = polyfillStyleText(hex, 'x', { validateStream: false })
        is(actual, expected, hex)
        if (hasNativeHex) {
          is(
            actual,
            styleText(/** @type {any} */ (hex), 'x', { validateStream: false }),
            hex
          )
        }
      }

      const boldHex = polyfillStyleText(['bold', '#f80'], 'x', {
        validateStream: false,
      })
      is(boldHex, '\u001B[1m\u001B[38;2;255;136;0mx\u001B[39m\u001B[22m')
      if (hasNativeHex) {
        is(
          boldHex,
          styleText(/** @type {any} */ (['bold', '#f80']), 'x', {
            validateStream: false,
          })
        )
      }

      const nestedHex = polyfillStyleText(
        '#f80',
        `a ${polyfillStyleText('red', 'b', { validateStream: false })} c`,
        { validateStream: false }
      )
      is(
        nestedHex,
        '\u001B[38;2;255;136;0ma \u001B[31mb\u001B[38;2;255;136;0m c\u001B[39m'
      )
      if (hasNativeHex) {
        is(
          nestedHex,
          styleText(
            /** @type {any} */ ('#f80'),
            `a ${styleText('red', 'b', { validateStream: false })} c`,
            { validateStream: false }
          )
        )
      }

      for (const invalid of ['#1234', '#ggg', '#', '#1234567']) {
        throws(
          () => polyfillStyleText(invalid, 'x', { validateStream: false }),
          { code: 'ERR_INVALID_ARG_VALUE' }
        )
      }
    })
  })
})
