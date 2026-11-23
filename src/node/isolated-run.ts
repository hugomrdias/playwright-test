/**
 * Runs the files of `--test-isolation process` in node mode with the `run()` of
 * `node:test`, each one in a process of its own. Unlike `node --test` it takes
 * the files as they are, not as glob patterns.
 *
 * It reads its options as JSON on stdin.
 */
import { registerHooks } from 'node:module'
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

// Like node, a reporter package resolves from `cwd` with the conditions of
// `import`. `import.meta.resolve` only takes the parent behind a flag.
const FROM_CWD = 'playwright-test-from-cwd:'
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith(FROM_CWD)) {
      return nextResolve(specifier, context)
    }
    return nextResolve(specifier.slice(FROM_CWD.length), {
      ...context,
      parentURL: pathToFileURL(path.join(process.cwd(), 'noop.js')).href,
    })
  },
})

/** Like `--test-reporter` of node */
async function loadReporter(name: string) {
  let reporter: unknown = Object.hasOwn(BUILTIN, name)
    ? BUILTIN[name]
    : await import(
        path.isAbsolute(name) ? pathToFileURL(name).href : `${FROM_CWD}${name}`
      )
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

// Before the files start, a reporter that fails to load runs none of them
const names = options.reporters.length > 0 ? options.reporters : ['spec']
const loaded = await Promise.all(names.map(loadReporter))

const stream = run({
  files: options.files,
  isolation: 'process',
  concurrency:
    options.concurrency ?? Math.max(os.availableParallelism() - 1, 1),
  execArgv: [
    ...options.imports.flatMap((url) => ['--import', url]),
    // Node 24.0 doesn't give `timeout` to the files
    ...(options.timeout ? [`--test-timeout=${options.timeout}`] : []),
  ],
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

for (const reporter of loaded) {
  // biome-ignore lint/suspicious/noExplicitAny: a reporter is a stream or a generator
  stream.compose(reporter as any).pipe(process.stdout)
}
