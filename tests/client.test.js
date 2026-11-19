import { strictEqual as is } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli } from './helpers.js'

/**
 * @param {string[]} args
 */
async function run(args) {
  const proc = await runCli([...args, '--runner', 'node-test'], {
    reject: false,
    timeout: 60_000,
  })

  is(proc.exitCode, 0, `${proc.stdout}\n${proc.stderr}`)
  return proc
}

/**
 * @param {import('../src/client/types.js').ClickOptions} options
 */
const clickOptions = (options) => options

describe('playwright-test/client', () => {
  it('has no signal option for page.click', () => {
    // @ts-expect-error an AbortSignal can't be sent to the runner
    clickOptions({ signal: AbortSignal.abort() })
    is(typeof clickOptions({ timeout: 1 }), 'object')
  })

  // browsers.test.js runs them in the other browsers
  for (const mode of ['main', 'worker']) {
    it(`calls the browser context with --mode ${mode}`, async () => {
      await run(['mocks/client/context.test.js', '--mode', mode])
    })

    it(`sends trusted input to the page with --mode ${mode}`, async () => {
      const proc = await run(['mocks/client/page.test.js', '--mode', mode])

      // The worker can't see the page, it only checks the calls make it there
      is(proc.stdout.includes('skipped 2'), mode === 'worker', proc.stdout)
    })
  }

  it('sends trusted input to the popup with --extension', async () => {
    await run(['mocks/client/page.test.js', '--extension'])
  })

  it('rejects without a browser with --mode node', async () => {
    await run(['mocks/client/node.test.js', '--mode', 'node'])
  })
})
