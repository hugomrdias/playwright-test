import { ok } from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  publishConfig: {
    exports: Record<string, string | { default: string }>
  }
}

describe('build', () => {
  let outDir: string

  before(async () => {
    // Inside the repo so the build finds the dependencies
    fs.mkdirSync('node_modules/.cache', { recursive: true })
    outDir = fs.mkdtempSync(path.resolve('node_modules/.cache/pw-test-build-'))
    await execa('pnpm', [
      'exec',
      'tsc',
      '-p',
      'tsconfig.build.json',
      '--outDir',
      outDir,
    ])
  })
  after(() => {
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  // `tsc` only emits what the entry points import, a file it skips breaks the package
  for (const [name, target] of Object.entries(pkg.publishConfig.exports)) {
    // The client only loads in the page, it reads what the runner injects
    if (typeof target === 'string' || name === './client') {
      continue
    }
    it(`${name} can be imported`, async () => {
      const file = path.join(outDir, path.relative('dist', target.default))
      const mod = await import(pathToFileURL(file).href)
      ok(Object.keys(mod).length > 0, `${name} exports something`)
    })
  }
})
