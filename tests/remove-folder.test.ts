import { strictEqual as is, ok } from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, mock } from 'node:test'
import { REMOVE_WAIT, removeFolder } from '../src/base-runner.ts'
import { log } from '../src/utils/index.ts'

function folder() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pw-remove-'))
  mkdirSync(path.join(dir, 'nested'))
  writeFileSync(path.join(dir, 'nested', 'file.txt'), 'x')
  return dir
}

/** Make the `rm` of `fs/promises` do `fn`, also for its named import */
function mockRm(fn: () => Promise<void>) {
  mock.method(fsp, 'rm', fn)
  syncBuiltinESMExports()
}

describe('removeFolder', () => {
  afterEach(() => {
    mock.restoreAll()
    syncBuiltinESMExports()
  })

  it('deletes the folder, and a missing one is fine', async () => {
    const dir = folder()
    await removeFolder(dir)
    is(existsSync(dir), false)
    await removeFolder(dir)
  })

  it('only warns when it fails', async () => {
    const warn = mock.method(log, 'warn', () => undefined)
    mockRm(() => Promise.reject(new Error('EPERM: nope')))
    await removeFolder('/nowhere')
    is(warn.mock.callCount(), 1)
    ok(
      String(warn.mock.calls[0]?.arguments[0]).includes(
        'Could not delete /nowhere: EPERM: nope'
      )
    )
  })

  it('stops waiting for a folder still in use', async () => {
    const warn = mock.method(log, 'warn', () => undefined)
    mockRm(() => new Promise(() => undefined))
    const start = Date.now()
    await removeFolder('/nowhere')
    const took = Date.now() - start
    ok(took >= REMOVE_WAIT - 50 && took < REMOVE_WAIT + 1000, `${took}ms`)
    is(warn.mock.callCount(), 1)
    ok(String(warn.mock.calls[0]?.arguments[0]).includes('Stopped waiting'))
  })
})
