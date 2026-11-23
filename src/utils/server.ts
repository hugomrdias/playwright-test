import fs from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import path from 'node:path'

/**
 * Content types by extension. Scripts must be JavaScript for module scripts,
 * workers and service workers, and wasm must be `application/wasm` for
 * `WebAssembly.instantiateStreaming`. Unknown extensions get none, browsers
 * sniff them.
 */
const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  jsx: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  jsonld: 'application/ld+json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  xml: 'text/xml; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
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
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
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
    // `path.join` normalizes `..`, it must still be in the root
    if (file !== root && !file.startsWith(root + path.sep)) {
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

function end(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function handle(
  roots: string[],
  req: IncomingMessage,
  res: ServerResponse
) {
  let pathname: string
  try {
    pathname = decodeURIComponent(
      new URL(req.url ?? '/', 'http://localhost').pathname
    )
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
  // The test page, so storage from an earlier run doesn't leak into this one
  if (pathname === '/') {
    headers['Clear-Site-Data'] = '"cache", "cookies", "storage"'
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
