import { strictEqual as is, ok, throws } from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import fs from 'fs'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'
import { browserRegistry, isInstalled } from '../src/utils/index.js'

const require = createRequire(import.meta.url)
const { version } = require('playwright-core/package.json')

const noop = () => undefined

describe('browserRegistry', () => {
  /** @param {unknown} bundle */
  const changed = (bundle) =>
    throws(() => browserRegistry(bundle, ['chromium-headless-shell']), {
      message: new RegExp(
        `playwright-core ${version.replaceAll('.', '\\.')} changed the private API.*\\n.*npx playwright-core install chromium-headless-shell`
      ),
    })

  it('explains a missing coreBundle', () => {
    changed(undefined)
  })

  it('explains a registry without the methods it uses', () => {
    changed({ registry: { registry: {} } })
    changed({ registry: { registry: { findExecutable: noop } } })
  })

  it('explains executables it no longer finds', () => {
    changed({
      registry: { registry: { findExecutable: noop, install: noop } },
    })
  })

  it('finds the executables in the installed playwright-core', async () => {
    // @ts-expect-error
    const bundle = await import('playwright-core/lib/coreBundle')
    const { executables } = browserRegistry(bundle, [
      'chromium-headless-shell',
      'webkit',
    ])
    is(executables.length, 2)
    ok(executables[0].executablePath()?.includes('headless'))
  })
})

describe('isInstalled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-installed-'))
  const executable = path.join(root, 'browser-1', 'bin', 'browser')
  fs.mkdirSync(path.dirname(executable), { recursive: true })
  after(() => fs.rmSync(root, { recursive: true, force: true }))

  it('is false without an executable', () => {
    is(isInstalled(undefined), false)
    is(isInstalled(path.join(root, 'nope')), false)
  })

  it('is false until the download is marked complete', () => {
    fs.writeFileSync(executable, '')
    is(isInstalled(executable), false)
    fs.writeFileSync(path.join(root, 'browser-1', 'INSTALLATION_COMPLETE'), '')
    is(isInstalled(executable), true)
  })
})
