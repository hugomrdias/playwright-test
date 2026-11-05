import { strictEqual as is, ok } from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fromCommonjs } from './commonjs/index'
import { fromCts, shout } from './lib/common.cts'
import { indexed } from './lib/dir'
import { env as mjsEnv } from './lib/env.mjs'
import { extensionless } from './lib/extensionless'
import { jsxView } from './lib/jsx-view.jsx'
import { fromMts } from './lib/module.mjs'
import { rewritten } from './lib/rewritten.js'
import { rewrittenTsx } from './lib/rewritten-tsx.js'
import { view } from './lib/view.tsx'
import { env as noTypeEnv } from './no-type/env.js'
import { fromNoType, metaUrl, noTypeView } from './no-type/esm'
import noTypeCommonjs from './no-type/script'

const require = createRequire(import.meta.url)

describe('imports', () => {
  it('extensionless', () => {
    is(extensionless, 'extensionless')
  })

  it('.js to .ts', () => {
    is(rewritten, 'rewritten')
  })

  it('.js to .tsx', () => {
    is(rewrittenTsx.type, 'b')
  })

  it('directory index', () => {
    is(indexed, 'indexed')
  })

  it('.tsx', () => {
    is(view.type, 'div')
    is(view.props.title, 'tsx')
  })

  it('.jsx', () => {
    is(jsxView.type, 'span')
  })

  it('named exports from .cts', () => {
    is(fromCts, 'fromCts')
    is(shout('a'), 'A!')
  })

  it('.mjs to .mts', () => {
    is(fromMts, 4)
  })

  it('require of .cts and .ts', () => {
    is(require('./lib/common.cts').fromCts, 'fromCts')
    is(require('./lib/extensionless.ts').extensionless, 'extensionless')
    is(require('./lib/extensionless').extensionless, 'extensionless')
  })

  it('package with type commonjs', () => {
    is(fromCommonjs, 1)
  })

  it('package with no type', () => {
    is(fromNoType, 2)
    is(noTypeCommonjs.fromScript, 3)
    is(noTypeView.type, 'i')
    ok(metaUrl.endsWith('esm.ts'), metaUrl)
  })

  it('import.meta.env in .ts', () => {
    is(import.meta.env, process.env)
    is(import.meta.env.PW_SERVER, process.env.PW_SERVER)
  })

  it('import.meta.env in plain js', () => {
    is(mjsEnv, process.env)
    is(noTypeEnv, process.env)
  })
})
