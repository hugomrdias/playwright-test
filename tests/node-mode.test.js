import { strictEqual as is, ok } from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execa, runCli } from './helpers.js'

describe('node mode outside the package', () => {
  const cli = path.resolve('cli.js')
  const none = ['--runner', 'none', '--mode', 'node']
  /** @type {string} */
  let project

  beforeEach(() => {
    // The temp dir has no node_modules/.bin in any of its parent folders
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'))
  })

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true })
  })

  /**
   * PATH without the folders where c8 can be found, `pnpm run` adds our own
   */
  function envWithoutC8() {
    const key =
      Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
    const dirs = (process.env[key] ?? '')
      .split(path.delimiter)
      .filter(
        (dir) =>
          !['c8', 'c8.cmd'].some((bin) => fs.existsSync(path.join(dir, bin)))
      )
    return { [key]: dirs.join(path.delimiter) }
  }

  it('coverage without c8 in the project', async () => {
    // c8 leaves test files out of the report
    fs.writeFileSync(path.join(project, 'lib.js'), 'export const a = 1\n')
    fs.writeFileSync(
      path.join(project, 'entry.test.js'),
      "import { a } from './lib.js'\nconsole.log('hello from entry', a)\n"
    )

    const proc = await execa(
      process.execPath,
      [cli, 'entry.test.js', '--cov', ...none],
      { cwd: project, env: envWithoutC8(), reject: false }
    )

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes('hello from entry'), proc.stdout)
    ok(proc.stdout.includes('lib.js'), proc.stdout)
    ok(fs.existsSync(path.join(project, '.nyc_output/coverage-final.json')))
  })

  it('reports why tests could not start', async () => {
    fs.mkdirSync(path.join(project, 'sub'))
    fs.writeFileSync(path.join(project, 'sub/entry.test.js'), '')
    // Removing the cwd right before the tests start makes the spawn fail
    fs.writeFileSync(
      path.join(project, 'pw.config.mjs'),
      `import fs from 'node:fs'
export default {
  beforeTests() {
    fs.rmSync('sub', { recursive: true })
  },
}
`
    )

    const proc = await execa(
      process.execPath,
      [
        cli,
        'entry.test.js',
        '--cwd',
        'sub',
        '--config',
        'pw.config.mjs',
        ...none,
      ],
      { cwd: project, reject: false }
    )

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Could not start tests:'), proc.stderr)
  })

  it('runs with the same node and the binaries of the project', async () => {
    fs.writeFileSync(
      path.join(project, 'entry.test.js'),
      `console.log('EXEC', process.execPath)
console.log('BIN', process.env.PATH.split(${JSON.stringify(path.delimiter)})[0])
`
    )

    const proc = await execa(
      process.execPath,
      [cli, 'entry.test.js', ...none],
      { cwd: project, reject: false }
    )

    is(proc.exitCode, 0, proc.stderr)
    ok(proc.stdout.includes(`EXEC ${process.execPath}`), proc.stdout)
    ok(
      proc.stdout.includes(
        `BIN ${path.join(fs.realpathSync(project), 'node_modules', '.bin')}`
      ),
      proc.stdout
    )
  })

  it('failing tests only report the failure', async () => {
    fs.writeFileSync(path.join(project, 'entry.test.js'), 'process.exit(1)\n')

    const proc = await execa(
      process.execPath,
      [cli, 'entry.test.js', ...none],
      { cwd: project, reject: false }
    )

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Tests failed.'), proc.stderr)
    ok(!proc.stderr.includes('Could not start tests:'), proc.stderr)
  })
})

describe('node mode transform', () => {
  const node = ['--mode', 'node']
  const mocha = ['--runner', 'mocha', ...node]
  const none = ['--runner', 'none', ...node]

  it('full typescript', async () => {
    const proc = await runCli(['mocks/transform/syntax.test.ts', ...mocha])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('4 passing'), proc.stdout)
  })

  it('jsx, resolution, module formats and import.meta.env', async () => {
    const proc = await runCli(['mocks/transform/imports.test.ts', ...mocha])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('13 passing'), proc.stdout)
  })

  it('buildConfig', async () => {
    const proc = await runCli([
      'mocks/transform/config.test.tsx',
      '--config',
      'mocks/transform/pw.config.js',
      ...mocha,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('6 passing'), proc.stdout)
  })

  it('stack traces point at the typescript source', async () => {
    const proc = await runCli(['mocks/transform/stack.ts', ...none])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('stack.ts:11:11'), proc.stdout)
    ok(proc.stdout.includes('stack.ts:16:26'), proc.stdout)
  })

  it('coverage maps to the source files', async () => {
    const proc = await runCli([
      'mocks/transform/imports.test.ts',
      '--report-dir',
      '.coverage/node-mode',
      '--cov',
      ...mocha,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('extensionless.ts'), proc.stdout)
    ok(proc.stdout.includes('view.tsx'), proc.stdout)

    const cov = JSON.parse(
      fs.readFileSync('.coverage/node-mode/coverage-final.json', 'utf8')
    )
    ok(path.resolve('mocks/transform/lib/rewritten.ts') in cov, 'ts coverage')
    ok(path.resolve('mocks/transform/lib/view.tsx') in cov, 'tsx coverage')
    ok(path.resolve('mocks/transform/lib/module.mts') in cov, 'mts coverage')
    ok(path.resolve('mocks/transform/lib/common.cts') in cov, 'cts coverage')
  })

  it('import.meta.env', async () => {
    const proc = await runCli(['mocks/transform/plain.ts', ...none])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('import.meta.env: object'), proc.stdout)
  })

  it('--no-transform runs erasable typescript as plain node', async () => {
    const proc = await runCli([
      'mocks/transform/plain.ts',
      '--no-transform',
      ...none,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('import.meta.env: undefined'), proc.stdout)
  })

  it('--no-transform rejects non-erasable typescript', async () => {
    const proc = await runCli(
      ['mocks/transform/syntax.test.ts', '--no-transform', ...mocha],
      { reject: false }
    )

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'), proc.stderr)
  })

  it('transform: false in the config file', async () => {
    const proc = await runCli([
      'mocks/transform/plain.ts',
      '--config',
      'mocks/transform/no-transform.config.js',
      ...none,
    ])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('import.meta.env: undefined'), proc.stdout)
  })
})
