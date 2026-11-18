import { strictEqual as is } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

describe('playwright-test/client', () => {
  // browsers.test.js runs it in the other browsers
  for (const mode of ['main', 'worker']) {
    it(`calls the browser context with --mode ${mode}`, async () => {
      const proc = await runCli(
        [
          'mocks/client/context.test.js',
          '--runner',
          'node-test',
          '--mode',
          mode,
        ],
        { reject: false, timeout: 60_000 }
      )

      is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
    })
  }
})
