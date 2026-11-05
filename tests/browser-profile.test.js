import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { runCli } from './helpers.js'

describe('browser profile', () => {
  /** @type {string} */
  let temp
  /** @type {Record<string, string>} */
  let env

  beforeEach(() => {
    // In CI the slow drive can make Firefox outlast the wait for the exit
    const parent = process.env.PW_TEST_CHILD_TEMP || os.tmpdir()
    temp = fs.mkdtempSync(path.join(parent, 'pw-profile-'))
    // Which one os.tmpdir() reads depends on the platform
    env = { TMPDIR: temp, TMP: temp, TEMP: temp }
  })

  afterEach(() => {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 })
  })

  // Firefox makes this one itself on Windows, it's empty and always the same
  const leftovers = () =>
    fs.readdirSync(temp).filter((name) => name !== 'mozilla-temp-files')

  for (const browser of ['chromium', 'firefox', 'webkit']) {
    it(`is deleted after a run in ${browser}`, {
      timeout: 120_000,
    }, async () => {
      const proc = await runCli(
        ['mocks/none/stdout.test.js', '--runner', 'none', '--browser', browser],
        { env, timeout: 100_000 }
      )

      is(proc.exitCode, 0, 'exit code')
      equal(leftovers(), [])
    })
  }

  it('is in the temp folder and deleted when the run is cut short', async () => {
    const running = runCli(
      [
        'mocks/none/never-ends.test.js',
        '--runner',
        'none',
        '--run-timeout',
        '1000',
      ],
      {
        env: { ...env, PW_TEST_CONSOLE_FLUSH_TIMEOUT: '500' },
        reject: false,
        timeout: 40_000,
      }
    )
    // Says the browser is ready
    await once(running.stderr, 'data')
    const profiles = fs.readdirSync(temp)

    const proc = await running
    is(proc.exitCode, 1, 'exit code')
    ok(
      profiles.some((name) => name.includes('profile')),
      `a profile while running, found: ${profiles}`
    )
    equal(leftovers(), [])
  })
})
