import { strictEqual as is } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WriteStream } from 'node:tty'
import { styleText } from 'node:util'
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
      const saved = {
        FORCE_COLOR: process.env.FORCE_COLOR,
        NO_COLOR: process.env.NO_COLOR,
        NODE_DISABLE_COLORS: process.env.NODE_DISABLE_COLORS,
        TERM: process.env.TERM,
      }
      const restore = () => {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) {
            delete process.env[k]
          } else {
            process.env[k] = v
          }
        }
      }
      try {
        delete process.env.FORCE_COLOR
        delete process.env.NO_COLOR
        delete process.env.NODE_DISABLE_COLORS
        process.env.TERM = 'xterm-256color'

        is(
          polyfillStyleText('red', 'x', { stream: { isTTY: true } }),
          '\u001B[31mx\u001B[39m'
        )
        is(polyfillStyleText('red', 'x', { stream: { isTTY: false } }), 'x')

        process.env.TERM = 'dumb'
        is(polyfillStyleText('red', 'x', { stream: { isTTY: true } }), 'x')

        process.env.FORCE_COLOR = '1'
        is(
          polyfillStyleText('red', 'x', { stream: { isTTY: false } }),
          '\u001B[31mx\u001B[39m'
        )

        delete process.env.FORCE_COLOR
        process.env.TERM = 'xterm-256color'
        process.env.NO_COLOR = '1'
        is(polyfillStyleText('red', 'x', { stream: { isTTY: true } }), 'x')
      } finally {
        restore()
      }
    })
  })
})
