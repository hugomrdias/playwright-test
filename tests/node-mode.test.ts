import { strictEqual as is, ok } from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execa, runTest, TEST_CONCURRENCY } from './helpers.ts'

describe('node mode localStorage with mocha', {
  concurrency: TEST_CONCURRENCY,
}, () => {
  const fixture = 'mocks/runner-options/mocha.js'
  const args = ['--runner', 'mocha', '--mode', 'node']

  it('does not warn about it', async () => {
    const proc = await runTest([fixture, ...args], { reject: false })

    is(proc.exitCode, 0, proc.stderr)
    ok(!proc.stderr.includes('localStorage'), proc.stderr)
  })

  it('leaves it for tests with a file for it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'))
    try {
      const proc = await runTest(['mocks/web-storage/mocha.test.js', ...args], {
        env: {
          NODE_OPTIONS: `--localstorage-file=${path.join(dir, 'storage')}`,
        },
        reject: false,
      })

      is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('node mode outside the package', () => {
  const cli = path.resolve('src/bin.ts')
  const none = ['--runner', 'none', '--mode', 'node']
  let project: string

  beforeEach(() => {
    // The temp dir has no node_modules/.bin in any of its parent folders.
    // realpathSync normalizes macOS /var -> /private/var so in-process cwd matches
    // what a spawned child's process.cwd() resolves to.
    project = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'))
    )
  })

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true })
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

    const proc = await runTest(['entry.test.js', ...none], {
      cwd: project,
      reject: false,
    })

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

    const proc = await runTest(['entry.test.js', ...none], {
      cwd: project,
      reject: false,
    })

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('Tests failed.'), proc.stderr)
    ok(!proc.stderr.includes('Could not start tests:'), proc.stderr)
  })
})

describe('node mode passthrough', { concurrency: TEST_CONCURRENCY }, () => {
  const none = ['--runner', 'none', '--mode', 'node']

  it('runs erasable typescript as plain node', async () => {
    const proc = await runTest(['mocks/node-mode/plain.ts', ...none])

    is(proc.exitCode, 0, 'exit code')
    ok(proc.stdout.includes('plain import.meta.env: undefined'), proc.stdout)
  })

  it('rejects typescript plain node does not run', async () => {
    const proc = await runTest(['mocks/node-mode/enum.ts', ...none], {
      reject: false,
    })

    is(proc.exitCode, 1, 'exit code')
    ok(proc.stderr.includes('ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'), proc.stderr)
  })
})
