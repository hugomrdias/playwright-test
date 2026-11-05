import { after, before, describe, it } from 'node:test'
import fs from 'fs'
import { equal, is, ok } from 'uvu/assert'
import * as runners from '../src/test-runners.js'
import { detectTestRunners } from '../src/utils/auto-detect.js'
import { execa } from './helpers.js'

describe('runner auto detection', () => {
  /** @type {string} */
  let dir
  let count = 0

  before(() => {
    dir = fs.mkdtempSync('mocks/tmp-detect-')
  })
  after(() => {
    fs.rmSync(dir, { recursive: true })
  })

  /**
   * @param {string} source
   * @param {string} [ext]
   */
  const write = (source, ext = 'js') => {
    const file = `${dir}/${count++}.${ext}`
    fs.writeFileSync(file, source)
    return file
  }

  /**
   * @param {string[]} files
   */
  const detect = (files) =>
    [...detectTestRunners(files, runners).keys()].map((r) => r.moduleId)

  /** @type {Array<[string, string, string[], string?]>} */
  const cases = [
    ['import', "import test from 'tape'", ['tape']],
    ['side effect import', "import 'mocha'", ['mocha']],
    ['require', "const test = require('tape')", ['tape']],
    ['require member', "const test = require('tape').test", ['tape']],
    ['require destructured', "const { test } = require('uvu')", ['uvu']],
    ['not the first declarator', "const a = 1, b = require('uvu')", ['uvu']],
    ['require statement', "require('tape')", ['tape']],
    ['dynamic import', "const t = await import('uvu')", ['uvu']],
    ['dynamic import then', "import('uvu').then(() => {})", ['uvu']],
    ['node:test', "import { test } from 'node:test'", ['node:test']],
    [
      'node:test entrypoint',
      "import { test } from 'playwright-test/node-test'",
      ['node:test'],
    ],
    [
      'taps',
      "import { test } from 'playwright-test/taps'",
      ['playwright-test/taps'],
    ],
    [
      'taps and node:test',
      "import 'playwright-test/taps'\nimport 'node:test'",
      ['node:test'],
    ],
    ['mocha describe', "describe('a', () => {})", ['mocha']],
    ['mocha it', "it('a', () => {})", ['mocha']],
    ['mocha only', "describe.only('a', () => {})", ['mocha']],
    ['mocha skip', "it.skip('a', () => {})", ['mocha']],
    [
      'node:test wins over the describe it imports',
      "import { describe } from 'node:test'\ndescribe('a', () => {})",
      ['node:test'],
    ],
    // Nothing that says which runner it is
    ['nothing', 'console.log(1)', []],
    ['empty', '', []],
    ['require without arguments', 'const a = require()', []],
    ['require of a variable', 'const a = require(b)', []],
    ['the module none', "import 'none'", []],
    ['submodule', "import { equal } from 'uvu/assert'", []],
    ['similar name', "import 'tape-promise'", []],
    [
      'describe from elsewhere',
      "import { describe, it } from 'vitest'\ndescribe('a', () => {})\nit('a', () => {})",
      [],
    ],
    ['describe declared', "function describe() {}\ndescribe('a')", []],
    ['describe declared later', "describe('a')\nfunction describe() {}", []],
    ['describe in a variable', "const describe = () => {}\ndescribe('a')", []],
    ['describe destructured', "const { describe } = lib\ndescribe('a')", []],
    ['it renamed', "const { x: it = 1 } = lib\nit('a')", []],
    ['describe not at the top', "function a() { describe('a') }", []],
    ['other member', "describe.each('a')", []],
    ['other object', "lib.describe('a')", []],
    ['require not at the top', "test('a', () => require('tape'))", []],
    ['a string', 'const a = "import test from \'tape\'"', []],
    ['a comment', "// import test from 'tape'", []],
    // Types
    ['type import', "import type { Test } from 'tape'", [], 'ts'],
    ['inline type import', "import { type Test } from 'tape'", [], 'ts'],
    [
      'ts import',
      "import test from 'tape'\ntest('a', (t: any) => {})",
      ['tape'],
      'ts',
    ],
    ['ts annotated require', "const a: any = require('tape')", ['tape'], 'ts'],
    ['ts generic call', "describe<string>('a', () => {})", ['mocha'], 'ts'],
    ['tsx', "import 'uvu'\nconst a = <div />\nconsole.log(a)", ['uvu'], 'tsx'],
  ]

  for (const [name, source, expected, ext] of cases) {
    it(name, () => {
      equal(detect([write(source, ext)]), expected)
    })
  }

  it('looks past a first file that says nothing', () => {
    equal(detect([write('export const a = 1'), write("import 'tape'")]), [
      'tape',
    ])
  })

  it('reports every runner it finds', () => {
    equal(detect([write("import 'tape'"), write("describe('a')")]), [
      'tape',
      'mocha',
    ])
  })

  describe('cli', () => {
    it('falls back to none with a warning', async () => {
      const proc = await execa('./cli.js', [
        write('console.log("ran")'),
        '--mode',
        'node',
      ])

      is(proc.exitCode, 0, 'exit code')
      ok(proc.stdout.includes('ran'), proc.stdout)
      ok(proc.stderr.includes('Using "none"'), proc.stderr)
    })

    it('fails naming the runners when they conflict', async () => {
      const proc = await execa(
        './cli.js',
        [write("import 'tape'"), write("describe('a', () => {})")],
        { reject: false }
      )

      is(proc.exitCode, 1, 'exit code')
      ok(
        proc.stderr.includes('Found more than one test runner: "tape"'),
        proc.stderr
      )
      ok(proc.stderr.includes('"mocha"'), proc.stderr)
      ok(!proc.stderr.includes('    at '), proc.stderr)
    })

    it('--runner skips it', async () => {
      const proc = await execa(
        './cli.js',
        [
          write("import 'tape'\ndescribe('a', () => {})"),
          '--runner',
          'none',
          '--mode',
          'node',
          '--no-transform',
        ],
        { reject: false }
      )

      ok(!proc.stderr.includes('more than one'), proc.stderr)
    })

    it('says so when there are no test files', async () => {
      const proc = await execa('./cli.js', ['mocks/does-not-exist.js'], {
        reject: false,
      })

      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes('No test files were found'), proc.stderr)
      ok(!proc.stderr.includes('Using "none"'), proc.stderr)
      ok(!proc.stderr.includes('ERR_INVALID_ARG_TYPE'), proc.stderr)
    })

    it('a config runner is not reported as detected', async () => {
      const proc = await execa(
        './cli.js',
        ['mocks/test.mocha.js', '--config', 'mocks/config.js'],
        { reject: false }
      )

      ok(!proc.stderr.includes('Autodetected'), proc.stderr)
    })

    it('--runner taps', async () => {
      const proc = await execa(
        './cli.js',
        ['mocks/tops/test1.test.js', '--runner', 'taps', '--mode', 'node'],
        { reject: false }
      )

      is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
      ok(proc.stdout.includes('passing'), proc.stdout)
    })
  })
})
