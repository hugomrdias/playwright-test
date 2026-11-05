import { after, before, describe, it } from 'node:test'
import { execa } from 'execa'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { equal, is, ok } from 'uvu/assert'
import { findTests } from '../src/utils/index.js'

const extensions = ['js', 'ts']

/**
 * @param {string} cwd
 * @param {string[]} filePatterns
 */
const find = (cwd, filePatterns) =>
  findTests({ cwd, extensions, filePatterns }).sort()

/**
 * @param {string} root
 * @param {string[]} files
 */
const write = (root, files) => {
  for (const file of files) {
    const full = path.join(root, file)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, 'console.log("ran")\n')
  }
}

describe('findTests', () => {
  /** @type {string} */
  let cwd
  /** @type {string} */
  let outside

  before(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-find-'))
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-find-outside-'))
    write(cwd, [
      'a.test.js',
      'b.test.js',
      'c.test.ts',
      '_helper.test.js',
      'notes.md',
      'dir/d.test.js',
      'dir/e.test.js',
      'app/[id].test.js',
      'app/i.test.js',
      'app/d.test.js',
      'app/(group)/f.test.js',
      'test/fixtures/g.js',
    ])
    write(outside, ['h.test.js', 'nested/i.test.js'])
  })

  after(() => {
    fs.rmSync(cwd, { recursive: true })
    fs.rmSync(outside, { recursive: true })
  })

  /** @param {string[]} files */
  const inCwd = (...files) => files.map((f) => path.join(cwd, f)).sort()

  describe('paths that exist', () => {
    it('absolute, with the separators of the platform', () => {
      equal(
        find(cwd, [path.join(cwd, 'dir', 'd.test.js')]),
        inCwd('dir/d.test.js')
      )
    })

    it('absolute, with forward slashes', () => {
      const file = path.join(cwd, 'dir', 'd.test.js').replaceAll('\\', '/')
      equal(find(cwd, [file]), inCwd('dir/d.test.js'))
    })

    it('relative, with the separators of the platform', () => {
      equal(find(cwd, [path.join('dir', 'd.test.js')]), inCwd('dir/d.test.js'))
    })

    it('absolute directory', () => {
      equal(
        find(cwd, [path.join(cwd, 'dir')]),
        inCwd('dir/d.test.js', 'dir/e.test.js')
      )
    })

    it('relative directory, and the cwd itself', () => {
      equal(find(cwd, ['dir']), inCwd('dir/d.test.js', 'dir/e.test.js'))
      ok(find(cwd, ['.']).includes(inCwd('a.test.js')[0]))
    })

    it('absolute, outside of the cwd', () => {
      const file = path.join(outside, 'h.test.js')
      equal(find(cwd, [file]), [file])
    })

    it('absolute directory, outside of the cwd', () => {
      equal(find(cwd, [outside]), [
        path.join(outside, 'h.test.js'),
        path.join(outside, 'nested', 'i.test.js'),
      ])
    })

    // Windows CI has the checkout in D: and the temp folder in C:, the skip
    // reason shows up in the logs when that stops being true.
    const onAnotherDrive = path.isAbsolute(
      path.relative(process.cwd(), os.tmpdir())
    )
    const skip = onAnotherDrive ? false : 'the temp folder is in the same drive'

    it('absolute, on another drive', { skip }, () => {
      const file = path.join(outside, 'h.test.js')
      equal(find(process.cwd(), [file]), [file])
    })

    it('absolute directory, on another drive', { skip }, () => {
      equal(find(process.cwd(), [path.join(outside, 'nested')]), [
        path.join(outside, 'nested', 'i.test.js'),
      ])
    })

    it('with characters that are glob syntax', () => {
      equal(find(cwd, ['app/[id].test.js']), inCwd('app/[id].test.js'))
      equal(
        find(cwd, [path.join(cwd, 'app', '[id].test.js')]),
        inCwd('app/[id].test.js')
      )
      equal(find(cwd, ['app/(group)']), inCwd('app/(group)/f.test.js'))
    })

    it('and globs together', () => {
      equal(
        find(cwd, [path.join(cwd, 'a.test.js'), 'dir/*.test.js']),
        inCwd('a.test.js', 'dir/d.test.js', 'dir/e.test.js')
      )
    })

    it('still go through the filters', () => {
      equal(find(cwd, [path.join(cwd, '_helper.test.js')]), [])
      equal(find(cwd, [path.join(cwd, 'notes.md')]), [])
      equal(find(cwd, ['test/fixtures/g.js']), [])
    })
  })

  describe('globs', () => {
    it('wildcards', () => {
      equal(
        find(cwd, ['dir/*.test.js']),
        inCwd('dir/d.test.js', 'dir/e.test.js')
      )
    })

    it('braces', () => {
      equal(find(cwd, ['{a,b}.test.js']), inCwd('a.test.js', 'b.test.js'))
    })

    it('a character class, when no file has that name', () => {
      equal(find(cwd, ['app/[d].test.js']), inCwd('app/d.test.js'))
    })

    it('negation, with a glob and with a directory', () => {
      equal(find(cwd, ['dir/*.js', '!dir/e.test.js']), inCwd('dir/d.test.js'))
      equal(find(cwd, ['dir', '!dir/e.test.js']), inCwd('dir/d.test.js'))
    })

    it('default patterns without any', () => {
      ok(find(cwd, []).includes(inCwd('a.test.js')[0]))
    })
  })

  describe('nothing found', () => {
    it('a path that does not exist', () => {
      equal(find(cwd, ['missing.test.js']), [])
      equal(find(cwd, [path.join(cwd, 'missing.test.js')]), [])
    })

    it('a glob without matches', () => {
      equal(find(cwd, ['missing/*.test.js']), [])
    })

    it('an empty pattern is not the cwd', () => {
      equal(find(cwd, ['']), [])
    })
  })
})

describe('cli', () => {
  /** @type {string} */
  let dir
  /** @type {string} */
  let empty
  /** @type {string} */
  let file

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-find-cli-'))
    empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-find-empty-'))
    file = path.join(dir, 'abs.test.js')
    // The none runner has to end the run in browsers
    fs.writeFileSync(
      file,
      'console.log("ran")\nsetTimeout(() => process.exit(0))\n'
    )
  })

  after(() => {
    fs.rmSync(dir, { recursive: true })
    fs.rmSync(empty, { recursive: true })
  })

  /** @param {string[]} args */
  const cli = (args) => execa('./cli.js', args, { reject: false })

  /**
   * @param {import('execa').Result} proc
   * @param {number} code
   */
  const exited = (proc, code) =>
    is(proc.exitCode, code, `${proc.stdout}\n${proc.stderr}`)

  for (const mode of ['node', 'main']) {
    describe(`--mode ${mode}`, () => {
      it('runs an absolute path', async () => {
        const proc = await cli([file, '--mode', mode, '--runner', 'none'])

        exited(proc, 0)
        ok(proc.stdout.includes('ran'), proc.stdout)
        ok(!proc.stderr.includes('No test files'), proc.stderr)
      })

      /** @type {Array<[string, string[]]>} */
      const none = [
        ['a path that does not exist', ['mocks/does-not-exist.js']],
        ['a glob without matches', ['mocks/does-not-exist/**/*.js']],
      ]

      for (const [name, args] of none) {
        it(`exits with 1 for ${name}`, async () => {
          const proc = await cli([...args, '--mode', mode])

          exited(proc, 1)
          ok(proc.stderr.includes('No test files were found'), proc.stderr)
        })
      }

      it('exits with 1 without files in the project', async () => {
        const proc = await cli(['--cwd', empty, '--mode', mode])

        exited(proc, 1)
        ok(proc.stderr.includes('No test files were found'), proc.stderr)
      })

      it('exits with 1 with --debug too', async () => {
        const proc = await cli([
          'mocks/does-not-exist.js',
          '--debug',
          '--mode',
          mode,
        ])

        exited(proc, 1)
        ok(proc.stderr.includes('No test files were found'), proc.stderr)
      })
    })
  }
})
