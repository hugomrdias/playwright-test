import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { runCli } from './helpers.ts'

/**
 * Run `--version` with a fresh temp folder, where Node keeps its compile cache
 * by default, and return what's left in it.
 */
async function runInTemp(env: Record<string, string> = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-compile-cache-'))
  try {
    const proc = await runCli(['--version'], {
      env: {
        TMPDIR: temp,
        TMP: temp,
        TEMP: temp,
        // Set, Node would turn the cache on itself and hide a missing call in src/bin.ts
        NODE_COMPILE_CACHE: undefined,
        NODE_DISABLE_COMPILE_CACHE: undefined,
        ...env,
      },
    })
    is(proc.exitCode, 0, proc.stderr)
    return fs.readdirSync(temp, { recursive: true })
  } finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 })
  }
}

describe('compile cache', () => {
  it('is on by default', async () => {
    const files = await runInTemp()
    ok(files.length > 0, 'cache files in the temp folder')
  })

  it('is off with NODE_DISABLE_COMPILE_CACHE', async () => {
    equal(await runInTemp({ NODE_DISABLE_COMPILE_CACHE: '1' }), [])
  })
})
