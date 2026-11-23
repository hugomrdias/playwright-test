import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
  rejects,
} from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import fs from 'fs'
import path from 'path'
import { Runner } from '../src/runner.ts'
import { detectTestRunners } from '../src/utils/auto-detect.ts'
import { UsageError } from '../src/utils/index.ts'
import { resolveCli, runCli } from './helpers.ts'

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

  const detect = async (files: string[]) =>
    [
      ...(
        await detectTestRunners(files, { mode: 'browser', cwd: process.cwd() })
      ).keys(),
    ].map((r) => r.moduleId)

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
    ['mocha it', "it('a', async () => {})", ['mocha']],
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
      "import { describe, it } from 'vitest'\ndescribe('a', () => {})\nit('a', async () => {})",
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
    it(name, async () => {
      equal(await detect([write(source, ext)]), expected)
    })
  }

  it('looks past a first file that says nothing', async () => {
    equal(
      await detect([write('export const a = 1'), write("import 'node:test'")]),
      ['node:test']
    )
  })

  it('reports every runner it finds', async () => {
    equal(await detect([write("import 'node:test'"), write("describe('a')")]), [
      'node:test',
      'mocha',
    ])
  })

  it('follows imported test files through cycles', async () => {
    const suite = write("import './entry.js'\ndescribe('suite', () => {})")
    fs.writeFileSync(`${dir}/entry.js`, `import './${path.basename(suite)}'`)
    equal(await detect([`${dir}/entry.js`]), ['mocha'])
  })

  for (const statement of [
    "import './suite.js'",
    "export * from './suite.js'",
    "require('./suite.js')",
    "await import('./suite.js')",
  ]) {
    it(`follows ${statement}`, async () => {
      const suite = write("import 'node:test'")
      const entry = write(statement.replace('suite.js', path.basename(suite)))
      equal(await detect([entry]), ['node:test'])
    })
  }

  it('ignores unresolved imports and assets', async () => {
    const asset = write("import 'mocha'", 'svg')
    equal(
      await detect([
        write(`import './missing.js'\nimport './${path.basename(asset)}'`),
      ]),
      []
    )
  })

  describe('cli', () => {
    it('selects the runner from an imported suite', async () => {
      const suite = write("describe('suite', () => {})", 'ts')
      const entry = write(`import './${path.basename(suite, '.ts')}.js'`, 'ts')
      const { options } = await resolveCli([entry, '--mode', 'browser'])
      is(options.runner, 'mocha')
    })

    it('uses the browser package entry instead of an unused index', async () => {
      const suite = fs.mkdtempSync(path.join(dir, 'suite-'))
      fs.writeFileSync(path.join(suite, 'package.json'), '{"main":"other.js"}')
      fs.writeFileSync(path.join(suite, 'index.js'), "import 'node:test'")
      fs.writeFileSync(
        path.join(suite, 'other.js'),
        "describe('suite', () => {})"
      )
      const entry = write(
        `import './${path.basename(suite)}'\ndescribe('entry', () => {})`
      )
      const { options } = await resolveCli([entry, '--mode', 'browser'])
      is(options.runner, 'mocha')
    })

    it('runs a suite forwarded by a CommonJS entry', async () => {
      const suite = write(
        "describe('forwarded suite', () => it('runs', async () => {}))",
        'cjs'
      )
      const entry = write(
        `module.exports = require('./${path.basename(suite)}')`,
        'cjs'
      )
      const result = await runCli([entry, '--mode', 'node'])
      ok(result.stdout.includes('1 passing'), result.stdout)
    })

    it('resolves dotted extensionless imports when bundling', async () => {
      fs.writeFileSync(
        path.join(dir, 'suite.test.ts'),
        "describe('suite', () => {})"
      )
      const entry = write("import './suite.test'")
      const { options } = await resolveCli([entry, '--mode', 'browser'])
      is(options.runner, 'mocha')
    })

    it('resolves a relative tsconfig from the launch directory with --cwd', async () => {
      const cwd = fs.mkdtempSync(path.join(dir, 'cwd-'))
      const entry = path.join(cwd, 'entry.js')
      fs.writeFileSync(entry, "describe('suite', () => {})")
      const tsconfig = write('{}', 'json')
      const config = write(
        `export default { buildConfig: { tsconfig: ${JSON.stringify(tsconfig)} } }`
      )
      const { options } = await resolveCli([
        path.basename(entry),
        '--cwd',
        cwd,
        '--config',
        path.resolve(config),
      ])
      is(options.runner, 'mocha')
    })

    it('follows plugin redirects and runs output hooks only on the real bundle', async () => {
      const unused = write("import 'node:test'")
      const suite = write("describe('redirected suite', () => {})")
      const outputLog = path.resolve(dir, 'bundle-hook.log')
      const entry = write(
        `import './${path.basename(unused)}'\ndescribe('entry', () => {})`
      )
      const config = write(`
      import fs from 'node:fs'
      export default {
        buildConfig: { plugins: [{
          name: 'redirect-suite',
          setup(build) {
            build.onResolve({ filter: /^\\.\\// }, ({ path }) =>
              path === ${JSON.stringify(`./${path.basename(unused)}`)}
                ? { path: ${JSON.stringify(path.resolve(suite))} }
                : undefined
            )
            build.onEnd(() => {
              const bundle = fs.readFileSync(build.initialOptions.outfile, 'utf8')
              if (!bundle.includes('redirected suite')) {
                throw new Error('Redirected suite is missing from the bundle')
              }
              fs.appendFileSync(${JSON.stringify(outputLog)}, 'bundle\\n')
            })
          },
        }] },
      }`)
      const { options, testFiles } = await resolveCli([
        entry,
        '--config',
        config,
      ])
      is(options.runner, 'mocha')
      is(fs.existsSync(outputLog), false)
      const runner = new Runner(options, testFiles)
      try {
        await runner.compiler()
        is(fs.readFileSync(outputLog, 'utf8'), 'bundle\n')
      } finally {
        fs.rmSync(runner.dir, { recursive: true, force: true })
      }
    })

    it('runs paired plugin lifecycle hooks only during real compilation', async () => {
      const entry = write("describe('suite', () => {})")
      const staging = path.resolve(dir, 'staging')
      const outputLog = path.resolve(dir, 'lifecycle.log')
      const config = write(`
      import fs from 'node:fs'
      export default {
        buildConfig: { plugins: [{
          name: 'stage-build',
          setup(build) {
            const staging = ${JSON.stringify(staging)}
            const log = ${JSON.stringify(outputLog)}
            build.onStart(() => {
              fs.mkdirSync(staging)
              fs.appendFileSync(log, 'start\\n')
            })
            build.onEnd(() => {
              fs.rmSync(staging, { recursive: true })
              fs.appendFileSync(log, 'end\\n')
            })
          },
        }] },
      }`)
      const { options, testFiles } = await resolveCli([
        entry,
        '--config',
        config,
      ])
      is(options.runner, 'mocha')
      const runner = new Runner(options, testFiles)
      try {
        await runner.compiler()
        is(fs.readFileSync(outputLog, 'utf8'), 'start\nend\n')
        is(fs.existsSync(staging), false)
      } finally {
        fs.rmSync(runner.dir, { recursive: true, force: true })
      }
    })

    it('resolves each symlink from its own directory when preserving symlinks', async (t) => {
      const target = fs.mkdtempSync(path.join(dir, 'target-'))
      const wrapper = path.join(target, 'wrapper.js')
      fs.writeFileSync(wrapper, "import './suite.js'")
      fs.writeFileSync(path.join(target, 'suite.js'), "import 'node:test'")
      const first = fs.mkdtempSync(path.join(dir, 'first-'))
      const second = fs.mkdtempSync(path.join(dir, 'second-'))
      for (const directory of [first, second]) {
        try {
          fs.symlinkSync(
            path.resolve(wrapper),
            path.join(directory, 'wrapper.js')
          )
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
          t.skip('symlink creation is unavailable')
          return
        }
      }
      fs.writeFileSync(path.join(first, 'suite.js'), 'export {}')
      fs.writeFileSync(
        path.join(second, 'suite.js'),
        "describe('suite', () => {})"
      )
      const entry = write(
        `import './${path.basename(first)}/wrapper.js'\nimport './${path.basename(second)}/wrapper.js'`
      )
      const config = write(
        'export default { buildConfig: { preserveSymlinks: true } }'
      )
      const { options } = await resolveCli([entry, '--config', config])
      is(options.runner, 'mocha')
      const { options: defaults } = await resolveCli([entry])
      is(defaults.runner, 'node-test')
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
