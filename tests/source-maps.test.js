import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import esbuild from 'esbuild'
import { stack } from '../src/taps/utils.js'
import { createStackMapper } from '../src/utils/stack-map.js'
import { runCli } from './helpers.js'

const INTERNAL_MOCHA = /node_modules[/\\]mocha/

/**
 * @param {string} text
 * @param {string} search
 */
function count(text, search) {
  return text.split(search).length - 1
}

describe('stack mapper', () => {
  /** @type {string} */
  let dir

  /**
   * Line and column of a text in a bundle, the way browsers report them
   *
   * @param {string} name
   * @param {string} search
   */
  function positionIn(name, search) {
    const lines = readFileSync(path.join(dir, name), 'utf8').split('\n')
    const line = lines.findIndex((l) => l.includes(search))
    return `${line + 1}:${lines[line].indexOf(search) + 1}`
  }

  /**
   * @param {string} outName
   * @param {import('esbuild').BuildOptions} [options]
   */
  async function bundle(outName, options) {
    await esbuild.build({
      entryPoints: [path.join(dir, 'entry.js')],
      bundle: true,
      format: 'esm',
      sourcemap: 'inline',
      outfile: path.join(dir, outName),
      ...options,
    })
  }

  before(async () => {
    dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'pw-stack-map-')))
    await mkdir(path.join(dir, 'node_modules/mocha'), { recursive: true })
    writeFileSync(
      path.join(dir, 'node_modules/mocha/mocha.js'),
      'export const fromMocha = () => new Error("fromMocha")\n'
    )
    writeFileSync(
      path.join(dir, 'source.js'),
      '\n\nexport const fromSource = () => new Error("fromSource")\n'
    )
    writeFileSync(
      path.join(dir, 'entry.js'),
      `import { fromMocha } from './node_modules/mocha/mocha.js'
import { fromSource } from './source.js'
globalThis.out = [fromMocha, fromSource]
`
    )
    await bundle('bundle-out.js')
  })

  after(() => rmSync(dir, { recursive: true, force: true }))

  it('maps every stack format', () => {
    const { map } = createStackMapper(dir)
    const at = positionIn('bundle-out.js', 'new Error("fromSource")')
    const source = path.join(dir, 'source.js')

    is(
      map(`    at fn (http://127.0.0.1:1234/bundle-out.js:${at})`),
      `    at fn (${source}:3:33)`
    )
    is(map(`fn@http://127.0.0.1:1234/bundle-out.js:${at}`), `fn@${source}:3:33`)
    is(
      map(`    at chrome-extension://abc/bundle-out.js:${at}`),
      `    at ${source}:3:33`
    )
    // Mocha removes the url of the page
    is(map(`    at fn (bundle-out.js:${at})`), `    at fn (${source}:3:33)`)
  })

  it('leaves everything else as is', () => {
    const { map } = createStackMapper(dir)
    const at = positionIn('bundle-out.js', 'new Error("fromSource")')

    for (const text of [
      'nothing to see here',
      `http://127.0.0.1:1234/assets/bundle-out.js:${at}`,
      `my-bundle-out.js:${at}`,
      `    at fn (http://127.0.0.1:1234/other-out.js:${at})`,
      // No source map for this one
      '    at fn (http://127.0.0.1:1234/sw-out.js:1:1)',
      // Outside of what the source map knows, and not a frame
      `see http://127.0.0.1:1234/bundle-out.js:99999:1`,
    ]) {
      is(map(text), text)
    }
  })

  it('removes frames of the test runners', () => {
    const { map } = createStackMapper(dir)
    const mocha = positionIn('bundle-out.js', 'new Error("fromMocha")')
    const source = positionIn('bundle-out.js', 'new Error("fromSource")')
    const url = 'http://127.0.0.1:1234/bundle-out.js'

    is(
      map(`Error: x\n    at a (${url}:${mocha})\n    at b (${url}:${source})`),
      `Error: x\n    at b (${path.join(dir, 'source.js')}:3:33)`
    )
    is(
      map(`a@${url}:${mocha}\nb@${url}:${source}`),
      `b@${path.join(dir, 'source.js')}:3:33`
    )
    // Names with spaces in webkit and firefox
    is(map(`module code@${url}:${mocha}`), '')
    is(map(`promise callback*a@${url}:${mocha}`), '')
    is(
      map(`promise callback*b@${url}:${source}`),
      `promise callback*b@${path.join(dir, 'source.js')}:3:33`
    )
    // Not a frame, the position is still useful
    ok(map(`see ${url}:${mocha}`).startsWith('see '))
  })

  it('removes frames without a source and native frames next to them', () => {
    const { map } = createStackMapper(dir)
    const url = 'http://127.0.0.1:1234/bundle-out.js'
    const mocha = positionIn('bundle-out.js', 'new Error("fromMocha")')
    const at = positionIn('bundle-out.js', 'new Error("fromSource")')
    const source = `${path.join(dir, 'source.js')}:3:33`

    is(map(`    at __init (${url}:99999:1)`), '')
    is(
      map(
        [
          'Error: x',
          `    at a (${url}:${at})`,
          '    at Array.map (<anonymous>)',
          `    at b (${url}:${at})`,
          `    at c (${url}:${mocha})`,
          '    at async Promise.all (index 0)',
          '    at new Promise (<anonymous>)',
          `    at d (${url}:${mocha})`,
        ].join('\n')
      ),
      [
        'Error: x',
        `    at a (${source})`,
        '    at Array.map (<anonymous>)',
        `    at b (${source})`,
      ].join('\n')
    )
    is(
      map(`a@${url}:${at}\nmap@[native code]\nb@${url}:${mocha}`),
      `a@${source}`
    )
  })

  it('maps the strings in logged values', () => {
    const { map } = createStackMapper(dir)
    const at = positionIn('bundle-out.js', 'new Error("fromSource")')
    const frame = `    at fn (http://127.0.0.1:1234/bundle-out.js:${at})`
    const mapped = `    at fn (${path.join(dir, 'source.js')}:3:33)`

    const error = new Error('x')
    error.stack = frame
    is(map(error), error)
    is(error.stack, mapped)

    /** @type {any} */
    const cyclic = { list: [frame], nested: { frame }, number: 1, nil: null }
    cyclic.self = cyclic
    const out = map(cyclic)
    equal(out.list, [mapped])
    is(out.nested.frame, mapped)
    is(out.number, 1)
    is(out.nil, null)
    is(out.self, out)

    const other = new Map([['frame', frame]])
    is(map(other).get('frame'), frame)
    is(map(undefined), undefined)
  })

  it('reads source maps next to the bundle', async () => {
    await bundle('before-out.js', { sourcemap: 'linked' })
    const { map } = createStackMapper(dir)
    const at = positionIn('before-out.js', 'new Error("fromSource")')

    is(
      map(`at fn (before-out.js:${at})`),
      `at fn (${path.join(dir, 'source.js')}:3:33)`
    )
  })

  it('reset reads the bundles again', async () => {
    const mapper = createStackMapper(dir)
    await bundle('watch-out.js')
    const before = positionIn('watch-out.js', 'new Error("fromSource")')
    const text = `at fn (watch-out.js:${before})`
    const mapped = mapper.map(text)
    ok(mapped.includes('source.js:3:33'), mapped)

    // A build that moves the same position to nothing
    await bundle('watch-out.js', { sourcemap: false })
    is(mapper.map(text), mapped, 'cached')
    mapper.reset()
    is(mapper.map(text), text)
  })
})

/**
 * Fail on anything from the runner in the output of a failing run
 *
 * @param {string} output
 */
function assertNoInternals(output) {
  const text = output.replaceAll('\\', '/')
  for (const internal of [
    `${process.cwd().replaceAll('\\', '/')}/src/`,
    '<stdin>',
    '[eval',
    'node:internal',
    '-out.js',
    'Array.map',
    'Promise.all',
    '[native code]',
  ]) {
    ok(!text.includes(internal), `found "${internal}" in:\n${text}`)
  }
}

const REPORTERS = {
  taps: ['mocks/source-maps/taps-fails.js', '--runner', 'taps'],
  'our node:test': [
    'mocks/source-maps/node-test-fails.test.js',
    '--runner',
    'node-test',
  ],
}

describe('stack traces in node mode', () => {
  for (const [name, args] of Object.entries(REPORTERS)) {
    it(`${name} has no frames of the runner`, async () => {
      const proc = await runCli([...args, '--mode', 'node'], { reject: false })
      const output = `${proc.stdout}${proc.stderr}`

      is(proc.exitCode, 1, output)
      ok(/fails\.(test\.)?js:5:/.test(output), output)
      assertNoInternals(output)
    })
  }

  it('keeps frames that only look internal', () => {
    const error = new Error('x')
    error.stack = [
      'Error: x',
      '    at nodeHelper (/project/taps/node.js:1:1)',
      '    at drain (file:///src/node/test.js:1:1)',
      '    at node:internal/process/task_queues:1:1',
      '    at [eval1]:7:1',
    ].join('\n')
    const previous = process.env.PW_TEST_SRC
    process.env.PW_TEST_SRC = '/src/'
    try {
      is(stack(error).trim(), 'at nodeHelper (/project/taps/node.js:1:1)')
    } finally {
      if (previous === undefined) {
        delete process.env.PW_TEST_SRC
      } else {
        process.env.PW_TEST_SRC = previous
      }
    }
  })
})

// The other files run in chromium, stack traces can't be mapped in the page in the others
for (const browser of ['chromium', 'firefox', 'webkit']) {
  describe(`stack traces in ${browser}`, () => {
    const flags = ['--browser', browser]

    it('mocha points at the source without its own frames', async () => {
      const proc = await runCli(
        ['mocks/runner-options/mocha-fails.js', '--runner', 'mocha', ...flags],
        { reject: false }
      )

      is(proc.exitCode, 1, 'exit code')
      ok(proc.stdout.includes('mocha-fails.js:4:'), proc.stdout)
      ok(!proc.stdout.includes('bundle-out.js'), proc.stdout)
      ok(!INTERNAL_MOCHA.test(proc.stdout), proc.stdout)
    })

    it('mocha in a worker', async () => {
      const proc = await runCli(
        [
          'mocks/runner-options/mocha-fails.js',
          '--runner',
          'mocha',
          '--mode',
          'worker',
          ...flags,
        ],
        { reject: false }
      )

      is(proc.exitCode, 1, 'exit code')
      ok(proc.stdout.includes('mocha-fails.js:4:'), proc.stdout)
      ok(!proc.stdout.includes('bundle-out.js'), proc.stdout)
    })

    for (const [name, args] of Object.entries(REPORTERS)) {
      for (const mode of ['main', 'worker']) {
        it(`${name} has no frames of the runner in ${mode}`, async () => {
          const proc = await runCli([...args, '--mode', mode, ...flags], {
            reject: false,
          })
          const output = `${proc.stdout}${proc.stderr}`

          is(proc.exitCode, 1, output)
          ok(/fails\.(test\.)?js:5:/.test(output), output)
          ok(/fails\.(test\.)?js:(9|10):/.test(output), output)
          assertNoInternals(output)
        })
      }
    }

    it('typescript written to stdout', async () => {
      const proc = await runCli([
        'mocks/transform/stack.ts',
        '--runner',
        'none',
        ...flags,
      ])

      is(proc.exitCode, 0, 'exit code')
      ok(proc.stdout.includes('stack.ts:11:'), proc.stdout)
      ok(proc.stdout.includes('stack.ts:16:'), proc.stdout)
    })

    it('every way of logging an error', async () => {
      const proc = await runCli([
        'mocks/source-maps/console.js',
        '--runner',
        'none',
        ...flags,
      ])

      is(proc.exitCode, 0, 'exit code')
      is(count(proc.stdout, 'console.js:3:'), 6, proc.stdout)
      is(count(proc.stderr, 'console.js:3:'), 1, proc.stderr)
    })

    it('uncaught exceptions', async () => {
      const proc = await runCli([
        'mocks/source-maps/uncaught.js',
        '--runner',
        'none',
        ...flags,
      ])
      const output = `${proc.stdout}${proc.stderr}`

      is(proc.exitCode, 0, 'exit code')
      ok(output.includes('uncaught.js:2:'), output)
    })
  })
}
