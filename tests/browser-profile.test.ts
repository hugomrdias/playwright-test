import {
  deepStrictEqual as equal,
  strictEqual as is,
  ok,
} from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { runCli, TEST_CONCURRENCY } from './helpers.ts'

/**
 * Give each test its own temp directory so all browser profile tests can run
 * concurrently without observing each other's profiles.
 */
async function withTempDir(
  fn: (ctx: {
    temp: string
    env: Record<string, string>
    leftovers: () => string[]
  }) => Promise<void>
) {
  // In CI the slow drive can make Firefox outlast the wait for the exit
  const parent = process.env.PW_TEST_CHILD_TEMP || os.tmpdir()
  const temp = fs.mkdtempSync(path.join(parent, 'pw-profile-'))
  // Which one os.tmpdir() reads depends on the platform
  const env = { TMPDIR: temp, TMP: temp, TEMP: temp }
  // Firefox makes this one itself on Windows, it's empty and always the same.
  // Node's compile cache is kept on purpose, it's shared by every run.
  const leftovers = () =>
    fs
      .readdirSync(temp)
      .filter(
        (name) => name !== 'mozilla-temp-files' && name !== 'node-compile-cache'
      )

  try {
    await fn({ temp, env, leftovers })
  } finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 })
  }
}

describe('browser profile', { concurrency: TEST_CONCURRENCY }, () => {
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    it(`is deleted after a run in ${browser}`, {
      timeout: 120_000,
    }, async () => {
      await withTempDir(async ({ env, leftovers }) => {
        const proc = await runCli(
          [
            'mocks/none/stdout.test.js',
            '--runner',
            'none',
            '--browser',
            browser,
          ],
          { env, timeout: 100_000 }
        )

        is(proc.exitCode, 0, 'exit code')
        equal(leftovers(), [])
      })
    })
  }

  it('is deleted when interrupted while the browser starts', {
    skip: process.platform === 'win32' && 'no SIGINT or shell script browsers',
  }, async () => {
    await withTempDir(async ({ temp, env, leftovers }) => {
      const running = runCli(
        [
          'mocks/none/stdout.test.js',
          '--runner',
          'none',
          '--config',
          'mocks/profile/never-starts.config.js',
        ],
        { env, reject: false, timeout: 40_000 }
      )
      // Playwright fills the profile before it starts the browser
      while (!fs.readdirSync(temp).some((name) => name.includes('profile'))) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      running.kill('SIGINT')

      const proc = await running
      is(proc.exitCode, 130, 'exit code')
      equal(leftovers(), [])
    })
  })

  it('is deleted when interrupted while the build never ends', {
    skip: process.platform === 'win32' && 'no SIGINT',
  }, async () => {
    await withTempDir(async ({ env, leftovers }) => {
      const running = runCli(
        [
          'mocks/none/stdout.test.js',
          '--runner',
          'none',
          '--watch',
          '--config',
          'mocks/profile/stuck-build.config.js',
        ],
        {
          // So the exit hook runs out of time quickly
          env: {
            ...env,
            PW_TEST_AFTER_TESTS_TIMEOUT: '500',
            PW_TEST_EXIT_WAIT: '500',
          },
          reject: false,
          timeout: 40_000,
        }
      )
      running.stderr?.on('data', (data: Buffer) => {
        if (data.toString().includes('build-stuck')) {
          running.kill('SIGINT')
        }
      })

      const proc = await running
      is(proc.exitCode, 130, 'exit code')
      // The files of the run stay, the build could still be writing them
      equal(
        leftovers().filter((name) => name.endsWith('-profile')),
        []
      )
    })
  })

  it('is in the temp folder and deleted when the run is cut short', async () => {
    await withTempDir(async ({ temp, env, leftovers }) => {
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
})
