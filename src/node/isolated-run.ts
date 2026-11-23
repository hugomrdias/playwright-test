/**
 * Runs the files of `--test-isolation process` in node mode with the `run()` of
 * `node:test`, each one in a process of its own. Unlike `node --test` it takes
 * the files as they are, not as glob patterns.
 *
 * It reads its options as JSON on stdin.
 */
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { run } from 'node:test'
import { dot, junit, lcov, spec, tap } from 'node:test/reporters'
import { pathToFileURL } from 'node:url'

const BUILTIN: Record<string, unknown> = { dot, junit, lcov, spec, tap }

interface IsolatedRunOptions {
  files: string[]
  /** Preloaded in each file */
  imports: string[]
  concurrency?: number
  testNamePatterns: string[]
  timeout?: number
  /** Built-in names or module specifiers, from `cwd` */
  reporters: string[]
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString()) as IsolatedRunOptions
}

/** A path or a package, from `cwd` */
function resolveReporter(name: string) {
  if (name.startsWith('.') || path.isAbsolute(name)) {
    return pathToFileURL(path.resolve(name)).href
  }
  try {
    const file = createRequire(path.join(process.cwd(), 'noop.js')).resolve(
      name
    )
    return pathToFileURL(file).href
  } catch {
    // Maybe only for `import`
    return name
  }
}

/** Like `--test-reporter` of node */
async function loadReporter(name: string) {
  let reporter: unknown = Object.hasOwn(BUILTIN, name)
    ? BUILTIN[name]
    : await import(resolveReporter(name))
  if (reporter && typeof reporter === 'object' && 'default' in reporter) {
    reporter = reporter.default
  }
  if (
    typeof reporter === 'function' &&
    Object.getOwnPropertyDescriptor(reporter.prototype ?? {}, 'constructor')
  ) {
    reporter = new (reporter as new () => unknown)()
  }
  if (!reporter) {
    throw new TypeError(`"${name}" is not a valid reporter`)
  }
  return reporter
}

const options = await readStdin()
const controller = new AbortController()
// Stopping the run ends the files and still reports what ran
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort())
}

const stream = run({
  files: options.files,
  isolation: 'process',
  concurrency:
    options.concurrency ?? Math.max(os.availableParallelism() - 1, 1),
  execArgv: options.imports.flatMap((url) => ['--import', url]),
  testNamePatterns:
    options.testNamePatterns.length > 0 ? options.testNamePatterns : undefined,
  timeout: options.timeout,
  signal: controller.signal,
})
stream.on('test:summary', (data) => {
  if (data.file === undefined && !data.success) {
    process.exitCode = 1
  }
})

const names = options.reporters.length > 0 ? options.reporters : ['spec']
const loaded = await Promise.all(names.map(loadReporter))
for (const reporter of loaded) {
  // biome-ignore lint/suspicious/noExplicitAny: a reporter is a stream or a generator
  stream.compose(reporter as any).pipe(process.stdout)
}
