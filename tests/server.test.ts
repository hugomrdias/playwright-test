import { deepStrictEqual as equal, strictEqual as is } from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http, { type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { closeServer } from '../src/utils/index.ts'
import { contentType, parseRange, startServer } from '../src/utils/server.ts'

/**
 * A request with the path as it is, `fetch` would normalize `..` away.
 */
function raw(url: string, rawPath: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const { hostname, port } = new URL(url)
    http
      .get({ hostname, port, path: rawPath }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      })
      .once('error', reject)
  })
}

describe('http server', () => {
  let root: string
  let url: string
  let server: Server

  before(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'pw-server-'))
    const dir = path.join(root, 'run')
    const cwd = path.join(root, 'cwd')
    mkdirSync(path.join(dir, 'nested'), { recursive: true })
    mkdirSync(path.join(cwd, 'assets', 'sub'), { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), '<p>run</p>')
    writeFileSync(path.join(dir, 'nested', 'index.html'), '<p>nested</p>')
    writeFileSync(path.join(dir, 'bundle-out.js'), 'export {}')
    writeFileSync(path.join(dir, 'shared.txt'), 'from run')
    writeFileSync(path.join(cwd, 'assets', 'shared.txt'), 'from assets')
    writeFileSync(path.join(cwd, 'assets', 'digits.txt'), '0123456789')
    writeFileSync(path.join(cwd, 'assets', 'empty.txt'), '')
    writeFileSync(path.join(cwd, 'assets', 'sub', 'a b.wasm'), 'wasm')
    writeFileSync(path.join(cwd, 'assets', 'file.tar.gz'), 'not really gzip')
    writeFileSync(path.join(cwd, 'assets', 'blob.unknownext'), 'blob')
    writeFileSync(path.join(cwd, 'secret.txt'), 'secret')
    ;({ url, server } = await startServer(dir, cwd, 'assets'))
  })

  after(async () => {
    await closeServer(server, 1000)
    rmSync(root, { recursive: true, force: true })
  })

  it('listens on a free port of 127.0.0.1', () => {
    is(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url), true, url)
  })

  it('serves the index of the run and clears site data on it', async () => {
    const rsp = await fetch(url)
    is(rsp.status, 200)
    is(await rsp.text(), '<p>run</p>')
    is(rsp.headers.get('content-type'), 'text/html; charset=utf-8')
    is(rsp.headers.get('clear-site-data'), '"cache", "cookies", "storage"')
    is(rsp.headers.get('cache-control'), 'no-store')
  })

  it('serves the index.html of a directory', async () => {
    const rsp = await fetch(new URL('nested', url))
    is(await rsp.text(), '<p>nested</p>')
    is(rsp.headers.get('clear-site-data'), null)
  })

  it('serves scripts as JavaScript', async () => {
    const rsp = await fetch(new URL('bundle-out.js', url))
    is(rsp.headers.get('content-type'), 'text/javascript; charset=utf-8')
    is(await rsp.text(), 'export {}')
  })

  it('looks in the run files first, then in --assets', async () => {
    is(await (await fetch(new URL('shared.txt', url))).text(), 'from run')
    is(await (await fetch(new URL('digits.txt', url))).text(), '0123456789')
  })

  it('decodes paths and serves wasm as application/wasm', async () => {
    const rsp = await fetch(new URL('sub/a%20b.wasm', url))
    is(rsp.status, 200)
    is(rsp.headers.get('content-type'), 'application/wasm')
  })

  it('sends .gz files as they are, without a content encoding', async () => {
    const rsp = await fetch(new URL('file.tar.gz', url))
    is(rsp.headers.get('content-encoding'), null)
    is(rsp.headers.get('content-type'), 'application/gzip')
    is(await rsp.text(), 'not really gzip')
  })

  it('sends no content type for unknown extensions', async () => {
    const rsp = await fetch(new URL('blob.unknownext', url))
    is(rsp.headers.get('content-type'), null)
    is(await rsp.text(), 'blob')
  })

  it('serves empty files', async () => {
    const rsp = await fetch(new URL('empty.txt', url))
    is(rsp.status, 200)
    is(rsp.headers.get('content-length'), '0')
    is(await rsp.text(), '')
  })

  it('answers HEAD without a body', async () => {
    const rsp = await fetch(new URL('digits.txt', url), { method: 'HEAD' })
    is(rsp.status, 200)
    is(rsp.headers.get('content-length'), '10')
    is(await rsp.text(), '')
  })

  it('serves byte ranges', async () => {
    const get = (range: string) =>
      fetch(new URL('digits.txt', url), { headers: { range } })

    const middle = await get('bytes=2-4')
    is(middle.status, 206)
    is(middle.headers.get('content-range'), 'bytes 2-4/10')
    is(middle.headers.get('content-length'), '3')
    is(await middle.text(), '234')

    is(await (await get('bytes=7-')).text(), '789')
    is(await (await get('bytes=-3')).text(), '789')
    is(await (await get('bytes=8-100')).text(), '89')

    const outside = await get('bytes=10-')
    is(outside.status, 416)
    is(outside.headers.get('content-range'), 'bytes */10')

    // Several ranges get the whole file
    const several = await get('bytes=0-1,3-4')
    is(several.status, 200)
    is(await several.text(), '0123456789')
  })

  it('404s for missing files', async () => {
    const rsp = await fetch(new URL('nope.js', url))
    is(rsp.status, 404)
  })

  it('does not serve files outside its folders', async () => {
    for (const rawPath of [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/..%5csecret.txt',
      '/sub/../../secret.txt',
    ]) {
      const { status, body } = await raw(url, rawPath)
      is(body.includes('secret'), false, rawPath)
      is(status === 404 || status === 400, true, `${rawPath} ${status}`)
    }
  })

  it('400s for malformed paths', async () => {
    is((await raw(url, '/%E0%A4%A')).status, 400)
    is((await raw(url, '/a%00.txt')).status, 400)
  })
})

describe('parseRange', () => {
  const cases: [string | undefined, ReturnType<typeof parseRange>][] = [
    [undefined, undefined],
    ['bytes=0-0', { start: 0, end: 0 }],
    ['bytes=0-', { start: 0, end: 9 }],
    ['bytes=-20', { start: 0, end: 9 }],
    ['bytes=-0', null],
    ['bytes=10-12', null],
    ['bytes=5-2', undefined],
    ['bytes=-', undefined],
    ['items=0-1', undefined],
    ['bytes=0-1, 2-3', undefined],
  ]
  for (const [header, expected] of cases) {
    it(String(header), () => {
      equal(parseRange(header, 10), expected)
    })
  }
})

describe('contentType', () => {
  it('is case insensitive and unknown for no extension', () => {
    is(contentType('A.MJS'), 'text/javascript; charset=utf-8')
    is(contentType('Makefile'), undefined)
  })
})
