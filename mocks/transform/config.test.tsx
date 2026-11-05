import { strictEqual as is } from 'node:assert/strict'
import { bracket, spaced } from './lib/define-spelling.js'
import note from './lib/note.txt'
import { fromDefine } from './lib/uses-define.js'
import commonjsDefine from './no-type/define.js'

function createElement(type: string) {
  return { type }
}

function legacy(target: object, key: string) {
  Object.assign(target, { [`${key}Decorated`]: true })
}

class Legacy {
  @legacy
  field = 1
}

declare const __DEFINED__: string

describe('buildConfig', () => {
  it('define in transformed files', () => {
    is(__DEFINED__, 'defined')
  })

  it('define in plain .js files', () => {
    is(fromDefine, 'defined')
    is(commonjsDefine, 'defined')
  })

  it('define spelled differently from the key in plain .js files', () => {
    is(bracket, 'defined')
    is(spaced, 'defined')
  })

  it('loader', () => {
    is(note.trim(), 'plain text')
  })

  it('jsx options', () => {
    is(((<p />) as unknown as { type: string }).type, 'p')
    is(createElement('a').type, 'a')
  })

  it('tsconfigRaw', () => {
    is(
      (new Legacy() as unknown as { fieldDecorated: boolean }).fieldDecorated,
      true
    )
  })
})
