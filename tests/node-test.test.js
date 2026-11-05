import { describe, it } from 'node:test'
import { execa } from 'execa'
import { is, ok } from 'uvu/assert'

/**
 * @param {string} name
 */
const fixture = (name) => `mocks/node-test/${name}.test.js`

describe('node:assert', () => {
  // Fails on any difference with the real node:assert, CI also runs it in firefox and webkit.
  it('same results as the real one', async () => {
    const { exitCode, stdout, stderr } = await execa(
      process.execPath,
      ['mocks/node-test/assert-compare.js'],
      { reject: false }
    )

    is(exitCode, 0, `${stdout}\n${stderr}`)
    for (const mode of ['node', 'main', 'worker']) {
      ok(stdout.includes(`${mode}: `), stdout)
    }
  })

  for (const mode of ['main', 'worker']) {
    it(`${mode}: exports and unsupported`, async () => {
      const { exitCode, stdout } = await execa(
        './cli.js',
        [fixture('assert-exports'), '--runner', 'none', '--mode', mode],
        { reject: false }
      )

      is(exitCode, 0, stdout)
      ok(stdout.includes('EXPORTS OK'), stdout)
    })
  }

  it('node: exports are the built-in', async () => {
    const { exitCode, stdout } = await execa(
      process.execPath,
      ['mocks/node-test/assert-builtin.test.js'],
      { reject: false }
    )

    is(exitCode, 0, stdout)
    ok(stdout.includes('EXPORTS OK'), stdout)
  })
})
