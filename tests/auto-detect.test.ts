import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
  rejects,
} from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import fs from 'fs'
import path from 'path'
import { detectTestRunners } from '../src/utils/auto-detect.ts'
import { UsageError } from '../src/utils/index.ts'
import { resolveCli } from './helpers.ts'

describe('runner auto detection', () => {
  let dir: string
  let count = 0

  before(() => {
    dir = fs.mkdtempSync('mocks/tmp-detect-')
  })
  after(() => {
    fs.rmSync(dir, { recursive: true })
  })

  const write = (source: string, ext: string = 'js') => {
    const file = `${dir}/${count++}.${ext}`
    fs.writeFileSync(file, source)
    return file
  }

  const detect = (files: string[]) =>
    [...detectTestRunners(files).keys()].map((r) => r.moduleId)

  const cases: [string, string, string[], string?][] = [
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
    [
      'node:test entrypoint',
      "import { test } from 'playwright-test/node-test'",
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
    [
      'jsx',
      "import 'mocha'\nconst a = <div />\nconsole.log(a)",
      ['mocha'],
      'jsx',
    ],
    [
      'jsx text is not a mocha call',
      "const a = <div>text; describe('not a suite'); more text</div>\nconsole.log(a)",
      [],
      'jsx',
    ],
    [
      'jsx node:test',
      "import { test } from 'node:test'\nconst view = () => <div>ok</div>\ntest('a', () => view())",
      ['node:test'],
      'jsx',
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
    equal(detect([write("import 'node:test'"), write("describe('a')")]), [
      'node:test',
      'mocha',
    ])
  })

  it('follows imported test files through cycles', () => {
    const suite = write("import './entry.js'\ndescribe('suite', () => {})")
    fs.writeFileSync(`${dir}/entry.js`, `import './${path.basename(suite)}'`)
    equal(detect([`${dir}/entry.js`]), ['mocha'])
  })

  for (const statement of [
    "import './suite.js'",
    "export * from './suite.js'",
    "require('./suite.js')",
    "await import('./suite.js')",
  ]) {
    it(`follows ${statement}`, () => {
      const suite = write("import 'node:test'")
      const entry = write(statement.replace('suite.js', path.basename(suite)))
      equal(detect([entry]), ['node:test'])
    })
  }

  it('ignores unresolved imports and assets', () => {
    const asset = write("import 'mocha'", 'svg')
    equal(
      detect([
        write(`import './missing.js'\nimport './${path.basename(asset)}'`),
      ]),
      []
    )
  })

  describe('cli', () => {
    it('selects the runner from an imported suite', async () => {
      const suite = write("describe('suite', () => {})", 'ts')
      const entry = write(`import './${path.basename(suite, '.ts')}.js'`, 'ts')
      const { options } = await resolveCli([entry, '--mode', 'node'])
      is(options.runner, 'mocha')
    })

    it('falls back to none with a warning', async () => {
      const { options, logs } = await resolveCli([
        write('console.log("ran")'),
        '--mode',
        'node',
      ])

      is(options.runner, 'none')
      ok(logs.includes('Using "none"'), logs)
    })

    it('fails naming the runners when they conflict', async () => {
      await rejects(
        resolveCli([
          write("import 'node:test'"),
          write("describe('a', () => {})"),
        ]),
        (error: Error) =>
          error instanceof UsageError &&
          error.message.includes(
            'Found more than one test runner: "node:test"'
          ) &&
          error.message.includes('"mocha"')
      )
    })

    it('--runner skips it', async () => {
      const { options } = await resolveCli([
        write("import 'node:test'\ndescribe('a', () => {})"),
        '--runner',
        'none',
      ])

      is(options.runner, 'none')
    })
  })
})
