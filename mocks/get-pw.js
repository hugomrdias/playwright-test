// Runs getPw with registry.install stubbed and prints what it was asked to install.
// Run it with PLAYWRIGHT_BROWSERS_PATH set: it fakes files in the browsers folder.
import fs from 'node:fs'
import path from 'node:path'
import { getPw } from '../src/utils/index.js'

const [, , state, platform] = process.argv

const {
  registry: { browserDirectoryToMarkerFilePath, registry },
  // @ts-expect-error
} = await import('playwright-core/lib/coreBundle')

if (platform) {
  Object.defineProperty(process, 'platform', { value: platform })
}

const browser = registry.findExecutable('chromium-headless-shell')

if (state === 'complete-with-winldd') {
  const winldd = registry.findExecutable('winldd')
  fs.mkdirSync(path.dirname(winldd.executablePath()), { recursive: true })
  fs.writeFileSync(winldd.executablePath(), '')
  fs.writeFileSync(browserDirectoryToMarkerFilePath(winldd.directory), '')
}

const hasBrowser = state === 'complete' || state === 'complete-with-winldd'

if (hasBrowser || state === 'no-marker') {
  fs.mkdirSync(path.dirname(browser.executablePath()), { recursive: true })
  fs.writeFileSync(browser.executablePath(), '')
}

if (hasBrowser || state === 'no-executable') {
  fs.mkdirSync(browser.directory, { recursive: true })
  fs.writeFileSync(browserDirectoryToMarkerFilePath(browser.directory), '')
}

/** @type {string[]} */
let installed = []
registry.install = (/** @type {{ name: string }[]} */ executables) => {
  installed = executables.map((e) => e.name)
  return Promise.resolve()
}

await getPw('chromium', false, false)
process.stdout.write(JSON.stringify(installed))
