import fs from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import path from 'node:path'

// Not imported, an import of `node:http` takes ~30ms: Node.js syncs all of its
// exports to the module, and one of them is a getter that loads undici
const { createServer } = process.getBuiltinModule('node:http')

/**
 * Content types by extension. Scripts must be JavaScript for module scripts,
 * workers and service workers, and wasm must be `application/wasm` for
 * `WebAssembly.instantiateStreaming`. Unknown extensions get none, browsers
 * sniff them.
 */
const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  xhtml: 'application/xhtml+xml',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  jsx: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  map: 'application/json',
  webmanifest: 'application/manifest+json',
  jsonld: 'application/ld+json',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  xml: 'text/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  xsl: 'application/xml',
  vtt: 'text/vtt',
  ics: 'text/calendar',
  rtf: 'text/rtf',
  m3u8: 'application/vnd.apple.mpegurl',
  mpd: 'application/dash+xml',
  epub: 'application/epub+zip',
  '7z': 'application/x-7z-compressed',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  zst: 'application/zstd',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  bin: 'application/octet-stream',
  svg: 'image/svg+xml',
  png: 'image/png',
  apng: 'image/apng',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  jxl: 'image/jxl',
  heic: 'image/heic',
  heif: 'image/heif',
  eot: 'application/vnd.ms-fontobject',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mpeg: 'video/mpeg',
  m4v: 'video/mp4',
  '3gp': 'video/3gpp',
  weba: 'audio/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
}

/**
 * The content type of a file, `undefined` when it's unknown.
 */
export function contentType(file: string): string | undefined {
  return TYPES[path.extname(file).slice(1).toLowerCase()]
}

/**
 * The byte range of a `Range` header, inclusive. `undefined` means the whole
 * file, for no header or one we don't handle (multiple ranges, other units),
 * and `null` that the range is outside the file.
 */
export function parseRange(
  header: string | undefined,
  size: number
): { start: number; end: number } | null | undefined {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/)
  if (!match) {
    return
  }
  const [, first, last] = match
  if (first === '' && last === '') {
    return
  }
  if (first === '') {
    // Suffix range, the last n bytes
    const length = Number(last)
    if (length === 0 || size === 0) {
      return null
    }
    return { start: Math.max(size - length, 0), end: size - 1 }
  }
  const start = Number(first)
  if (start >= size) {
    return null
  }
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
  if (end < start) {
    return
  }
  return { start, end }
}

/**
 * The file of a request path in one of the roots, the first one that has it.
 * A directory serves its `index.html`.
 */
async function find(roots: string[], pathname: string) {
  for (const root of roots) {
    let file = path.join(root, pathname)
    // `path.join` normalizes `..`, it must still be in the root. Relative to
    // it so that a root like `/` or `C:\` works too.
    const relative = path.relative(root, file)
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      continue
    }
    let stats = await fs.promises.stat(file).catch(() => undefined)
    if (stats?.isDirectory()) {
      file = path.join(file, 'index.html')
      stats = await fs.promises.stat(file).catch(() => undefined)
    }
    if (stats?.isFile()) {
      return { file, stats }
    }
  }
}

/**
 * The path of a request target, without its query, `undefined` for a target
 * that isn't a path, like the `*` of `OPTIONS *`. Not with `new URL()`, it
 * reads a path that starts with `//` as a host, like `${PW_SERVER}/file`.
 */
export function requestPath(target = '/'): string | undefined {
  if (target.startsWith('/')) {
    return target.replace(/[?#].*$/s, '')
  }
  // The absolute form, `http://host/path`
  if (URL.canParse(target) && /^https?:/i.test(target)) {
    return new URL(target).pathname
  }
}

function end(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * Loaded before the tests, so storage from an earlier run doesn't leak into
 * this one. Not the test page, the files of an isolated run share the storage.
 */
export const CLEAR_SITE_DATA_PATH = '/__playwright-test__/clear-site-data'

/**
 * The search param of the iframe the tests run in, at `/` like the page around
 * it. It tells the iframe apart from the iframes of the tests, see `compileSw`.
 */
export const TEST_FRAME_PARAM = 'playwright-test'

async function handle(
  roots: string[],
  req: IncomingMessage,
  res: ServerResponse
) {
  const target = requestPath(req.url)
  if (target === undefined) {
    return end(res, 400, 'Bad Request')
  }
  if (target === CLEAR_SITE_DATA_PATH) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Clear-Site-Data': '"cache", "cookies", "storage"',
      'Content-Length': 0,
    })
    return res.end()
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(target)
  } catch {
    return end(res, 400, 'Bad Request')
  }
  if (pathname.includes('\0')) {
    return end(res, 400, 'Bad Request')
  }

  const found = await find(roots, pathname)
  if (!found) {
    return end(res, 404, 'Not Found')
  }
  const { file, stats } = found

  // Never cached, the files of a run change between runs and in watch mode
  const headers: Record<string, string | number> = {
    'Cache-Control': 'no-store',
    'Last-Modified': stats.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
  }
  const type = contentType(file)
  if (type) {
    headers['Content-Type'] = type
  }
  // `.gz` and `.br` files are sent as they are, without a `Content-Encoding`,
  // so the browser doesn't decompress them

  const range = parseRange(req.headers.range, stats.size)
  if (range === null) {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` })
    return res.end()
  }
  const { start, end: last } = range ?? { start: 0, end: stats.size - 1 }
  if (range) {
    headers['Content-Range'] = `bytes ${start}-${last}/${stats.size}`
  }
  headers['Content-Length'] = Math.max(last - start + 1, 0)
  res.writeHead(range ? 206 : 200, headers)

  if (req.method === 'HEAD' || stats.size === 0) {
    return res.end()
  }
  fs.createReadStream(file, { start, end: last })
    .once('error', (error) => res.destroy(error))
    .pipe(res)
}

/**
 * Start the http server of a run on a free port of 127.0.0.1. It serves the
 * files of the run and then the ones of `--assets`.
 *
 * @param dir - Runner directory
 * @param cwd - Current working directory
 * @param assets - Assets directory
 */
export function startServer(
  dir: string,
  cwd: string,
  assets: string
): Promise<{ url: string; server: Server }> {
  const host = '127.0.0.1'
  const roots = [path.resolve(dir), path.resolve(cwd, assets)]
  const server = createServer((req, res) => {
    handle(roots, req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy(error as Error)
      } else {
        end(res, 500, 'Internal Server Error')
      }
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        return reject(new Error('Could not read server port'))
      }
      resolve({ url: `http://${host}:${address.port}/`, server })
    })
  })
}
