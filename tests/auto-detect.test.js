import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import fs from 'fs'
import * as runners from '../src/test-runners.js'
import { detectTestRunners } from '../src/utils/auto-detect.js'
import { runCli } from './helpers.js'

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
    ['import', "import test from 'node:test'", ['node:test']],
    ['side effect import', "import 'mocha'", ['mocha']],
    ['require', "const test = require('node:test')", ['node:test']],
    ['require member', "const test = require('node:test').test", ['node:test']],
    [
      'require destructured',
      "const { test } = require('node:test')",
      ['node:test'],
    ],
    [
      'not the first declarator',
      "const a = 1, b = require('mocha')",
      ['mocha'],
    ],
    ['require statement', "require('mocha')", ['mocha']],
    ['dynamic import', "const t = await import('mocha')", ['mocha']],
    ['dynamic import then', "import('mocha').then(() => {})", ['mocha']],
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
    ['submodule', "import 'mocha/mocha.js'", []],
    ['similar name', "import 'mocha-promise'", []],
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
    ['require not at the top', "test('a', () => require('mocha'))", []],
    ['a string', 'const a = "import test from \'node:test\'"', []],
    ['a comment', "// import test from 'node:test'", []],
    // Types
    ['type import', "import type { Test } from 'mocha'", [], 'ts'],
    ['inline type import', "import { type Test } from 'mocha'", [], 'ts'],
    [
      'ts import',
      "import test from 'node:test'\ntest('a', (t: any) => {})",
      ['node:test'],
      'ts',
    ],
    [
      'ts annotated require',
      "const a: any = require('mocha')",
      ['mocha'],
      'ts',
    ],
    ['ts generic call', "describe<string>('a', () => {})", ['mocha'], 'ts'],
    [
      'tsx',
      "import 'mocha'\nconst a = <div />\nconsole.log(a)",
      ['mocha'],
      'tsx',
    ],
  ]

  for (const [name, source, expected, ext] of cases) {
    it(name, () => {
      equal(detect([write(source, ext)]), expected)
    })
  }

  it('looks past a first file that says nothing', () => {
    equal(detect([write('export const a = 1'), write("import 'node:test'")]), [
      'node:test',
    ])
  })

  it('reports every runner it finds', () => {
    equal(
      detect([write("import 'playwright-test/taps'"), write("describe('a')")]),
      ['playwright-test/taps', 'mocha']
    )
  })

  describe('cli', () => {
    it('falls back to none with a warning', async () => {
      const proc = await runCli([write('console.log("ran")'), '--mode', 'node'])

      is(proc.exitCode, 0, 'exit code')
      ok(proc.stdout.includes('ran'), proc.stdout)
      ok(proc.stderr.includes('Using "none"'), proc.stderr)
    })

    it('fails naming the runners when they conflict', async () => {
      const proc = await runCli(
        [write("import 'node:test'"), write("describe('a', () => {})")],
        { reject: false }
      )

      is(proc.exitCode, 1, 'exit code')
      ok(
        proc.stderr.includes('Found more than one test runner: "node:test"'),
        proc.stderr
      )
      ok(proc.stderr.includes('"mocha"'), proc.stderr)
      ok(!proc.stderr.includes('    at '), proc.stderr)
    })

    it('--runner skips it', async () => {
      const proc = await runCli(
        [
          write("import 'playwright-test/taps'\ndescribe('a', () => {})"),
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
      const proc = await runCli(['mocks/does-not-exist.js'], {
        reject: false,
      })

      is(proc.exitCode, 1, 'exit code')
      ok(proc.stderr.includes('No test files were found'), proc.stderr)
      ok(!proc.stderr.includes('Using "none"'), proc.stderr)
      ok(!proc.stderr.includes('ERR_INVALID_ARG_TYPE'), proc.stderr)
    })

    it('a config runner is not reported as detected', async () => {
      const proc = await runCli(
        ['mocks/test.mocha.js', '--config', 'mocks/config.js'],
        { reject: false }
      )

      ok(!proc.stderr.includes('Autodetected'), proc.stderr)
    })

    it('--runner taps', async () => {
      const proc = await runCli(
        ['mocks/tops/test1.test.js', '--runner', 'taps', '--mode', 'node'],
        { reject: false }
      )

      is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
      ok(proc.stdout.includes('passing'), proc.stdout)
    })
  })
})
