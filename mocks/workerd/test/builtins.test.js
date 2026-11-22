import assert from 'node:assert/strict'
import * as http2 from 'node:http2'
import * as win32 from 'node:path/win32'
import { it } from 'node:test'
import * as v8 from 'node:v8'
import * as bareHttp2 from 'http2'
import * as bareWin32 from 'path/win32'
import * as bareV8 from 'v8'

it('bundles built-ins whose names contain digits', () => {
  assert.equal(win32.join('a', 'b'), 'a\\b')
  assert.equal(bareWin32.join('a', 'b'), 'a\\b')
  assert.equal(typeof http2, 'object')
  assert.equal(typeof bareHttp2, 'object')
  assert.equal(typeof v8, 'object')
  assert.equal(typeof bareV8, 'object')
})
