/**
 * Runs the files of `--test-isolation process` in node mode with the `run()` of
 * `node:test`, in this process, each file in a process of its own. Unlike
 * `node --test` it takes the files as they are, not as glob patterns.
 */
import { registerHooks } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import { run } from 'node:test'
import { dot, junit, lcov, spec, tap } from 'node:test/reporters'
import { pathToFileURL } from 'node:url'

const BUILTIN: Record<string, unknown> = { dot, junit, lcov, spec, tap }

export interface IsolatedRunOptions {
  files: string[]
  cwd: string
  /** Of the file processes */
  env: NodeJS.ProcessEnv
  /** Preloaded in each file */
  imports: string[]
  concurrency?: number
  testNamePatterns: string[]
  timeout?: number
  /** Built-in names or module specifiers, from `cwd` */
  reporters: string[]
  signal: AbortSignal
}

// Like node, a reporter package resolves from `cwd` with the conditions of
// `import`. `import.meta.resolve` only takes the parent behind a flag. Only
// registered for a reporter that needs it, the hook slows every import after.
const FROM_CWD = 'playwright-test-from-cwd:'
let fromCwd: string | undefined
function registerFromCwd(cwd: string) {
  if (fromCwd !== undefined) {
    fromCwd = cwd
    return
  }
  fromCwd = cwd
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith(FROM_CWD)) {
        return nextResolve(specifier, context)
      }
      return nextResolve(specifier.slice(FROM_CWD.length), {
        ...context,
        parentURL: pathToFileURL(path.join(fromCwd ?? '', 'noop.js')).href,
      })
    },
  })
}

/** Like `--test-reporter` of node */
async function loadReporter(name: string, cwd: string) {
  let reporter: unknown
  if (Object.hasOwn(BUILTIN, name)) {
    reporter = BUILTIN[name]
  } else if (path.isAbsolute(name)) {
    reporter = await import(pathToFileURL(name).href)
  } else {
    registerFromCwd(cwd)
    reporter = await import(`${FROM_CWD}${name}`)
  }
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

// `env` of `run()` is new in Node.js 25.6, before it the files get the env of
// this process
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
const RUN_ENV = major > 25 || (major === 25 && minor >= 6)

/**
 * Run the files, resolves with whether they passed once the reporters wrote
 * everything. Stopping it with `signal` still reports what ran.
 */
export async function runIsolated(options: IsolatedRunOptions) {
  // Before the files start, a reporter that fails to load runs none of them
  const names = options.reporters.length > 0 ? options.reporters : ['spec']
  const loaded = await Promise.all(
    names.map((name) => loadReporter(name, options.cwd))
  )
  // `run()` in a process with it thinks it's in a file of a run, and skips the
  // files as a recursive run
  delete process.env.NODE_TEST_CONTEXT
  if (!RUN_ENV) {
    for (const key of Object.keys(process.env)) {
      if (!(key in options.env)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, options.env)
  }

  const stream = run({
    files: options.files,
    cwd: options.cwd,
    ...(RUN_ENV ? { env: options.env } : {}),
    isolation: 'process',
    concurrency:
      options.concurrency ?? Math.max(os.availableParallelism() - 1, 1),
    execArgv: [
      '--enable-source-maps',
      ...options.imports.flatMap((url) => ['--import', url]),
      // Node 24.0 doesn't give `timeout` to the files
      ...(options.timeout ? [`--test-timeout=${options.timeout}`] : []),
    ],
    testNamePatterns:
      options.testNamePatterns.length > 0
        ? options.testNamePatterns
        : undefined,
    timeout: options.timeout,
    signal: options.signal,
  })
  let passed = true
  stream.on('test:summary', (data) => {
    if (data.file === undefined && !data.success) {
      passed = false
    }
  })

  const outputs = loaded.map((reporter) => {
    // biome-ignore lint/suspicious/noExplicitAny: a reporter is a stream or a generator
    const out = stream.compose(reporter as any)
    out.pipe(process.stdout, { end: false })
    return finished(out)
  })
  try {
    await Promise.all(outputs)
  } catch {
    passed = false
  }
  // A pipe may still hold what the reporters wrote
  if (process.stdout.writableNeedDrain) {
    await new Promise((resolve) => process.stdout.once('drain', resolve))
  }
  return passed
}
