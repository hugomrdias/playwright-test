import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { equal } from 'uvu/assert'
import { execa } from './helpers.js'

/**
 * @param {string} state
 * @param {string} [platform]
 */
async function installedBy(state, platform) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-get-pw-'))
  try {
    const proc = await execa(
      process.execPath,
      ['mocks/get-pw.js', state, ...(platform ? [platform] : [])],
      { env: { PLAYWRIGHT_BROWSERS_PATH: dir } }
    )
    return JSON.parse(proc.stdout)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('getPw', () => {
  it('installs on a fresh machine', async () => {
    equal(await installedBy('missing', 'linux'), ['chromium-headless-shell'])
  })

  it('installs when the marker is missing, as in an unfinished download', async () => {
    equal(await installedBy('no-marker', 'linux'), ['chromium-headless-shell'])
  })

  it('installs when the executable is missing', async () => {
    equal(await installedBy('no-executable', 'linux'), [
      'chromium-headless-shell',
    ])
  })

  it('skips the install when the browser is complete', async () => {
    equal(await installedBy('complete', 'linux'), [])
  })

  it('installs winldd with the browser on Windows', async () => {
    equal(await installedBy('complete', 'win32'), [
      'winldd',
      'chromium-headless-shell',
    ])
  })

  it('skips the install on Windows when winldd is complete too', {
    skip: process.platform !== 'win32',
  }, async () => {
    equal(await installedBy('complete-with-winldd'), [])
  })
})
