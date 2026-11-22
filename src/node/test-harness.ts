/** biome-ignore-all lint/suspicious/noConsole: its ok */
/**
 * What the runners use to drive `./test.ts`, and what it uses to report. It's
 * internal, `playwright-test/node-test` only exports what `node:test` does.
 */
import { inspect, styleText } from 'util'
import { supportsColor } from '../utils/colors.ts'
import { toRegExp } from '../utils/name-pattern.ts'
import { isFrame, removeInternalFrames } from '../utils/stack-frames.ts'

export interface RunResult {
  cancelled: number
  /** In milliseconds */
  duration: number
  /** Each one ready to print */
  errors: string[]
  /** Failed tests, and failed hooks outside of a test */
  failures: number
  passes: number
  skips: number
  suites: number
  todos: number
  total: number
}

export interface ReportedTest {
  name: string
  passed: boolean
  skip?: boolean
  todo?: boolean
  /** The reason for `skip` or `todo` */
  message?: string | null
  /** In milliseconds */
  time?: number
}

export const IS_ENV_WITH_DOM =
  typeof window === 'object' &&
  typeof document === 'object' &&
  document.nodeType === 9

export const IS_NODE =
  typeof process !== 'undefined' &&
  process.release !== undefined &&
  process.release.name === 'node'

/**
 * Start a timer, it returns a function that gives the milliseconds since.
 */
export function hrtime() {
  const start = performance.now()
  return () => performance.now() - start
}

const IGNORE = /^\s*at.*[\s(](?:node:|internal\/[\w/]*)|^\s*at.*\[eval\d*\]/

/**
 * Only in node mode, where frames have real paths. In browsers they are in the
 * bundle here, the runner removes them when mapping what the page prints.
 */
function isInternalFrame(line: string) {
  const src = process.env.PW_TEST_SRC
  return IGNORE.test(line) || (src !== undefined && line.includes(src))
}

/**
 * Clean up the stack traces in a text, what isn't a stack frame stays the same.
 */
export function cleanStack(text: string) {
  const lines = text.split('\n').map((line) => {
    if (!isFrame(line)) {
      return { text: line, internal: false }
    }
    const frame = line.replaceAll('\\', '/').replaceAll('file://', '')
    return { text: frame, internal: isInternalFrame(frame) }
  })
  return removeInternalFrames(lines).join('\n')
}

/**
 * What the run was configured with, see {@link configure}.
 */
export const config: {
  colors: boolean
  minimal: boolean
  namePattern: RegExp | null
  timeout: number | undefined
} = {
  colors: supportsColor(),
  minimal: false,
  namePattern: null,
  timeout: undefined,
}

/**
 * Color our own output without touching any global state that user tests could see.
 */
function paint(
  color: 'blue' | 'gray' | 'green' | 'red' | 'yellow',
  text: string
) {
  return config.colors
    ? styleText(color, text, { validateStream: false })
    : text
}

/**
 * Set the options of the run that aren't declared by the tests. The test runner
 * calls this with the `--test-name-pattern` and `--test-timeout` options, and
 * `minimal` when an AI agent drives the run.
 *
 * @param options.testNamePattern - Only run tests matching this regular expression or `/expression/flags`
 * @param options.testTimeout - Timeout of tests without their own, `0` for none
 * @param options.minimal - Only print failures and the summary, without colors unless `FORCE_COLOR` is set
 */
export function configure({
  minimal = false,
  testNamePattern,
  testTimeout,
}: {
  testNamePattern?: string
  testTimeout?: number
  minimal?: boolean
} = {}) {
  config.minimal = minimal
  config.colors = supportsColor({ minimal })
  config.namePattern =
    testNamePattern == null ? null : toRegExp(String(testNamePattern))
  config.timeout = testTimeout
}

/**
 * Whether a test matches `--test-name-pattern`, with the name of the test or of
 * any of its ancestors, on its own or joined by a space with its ancestors'.
 *
 * @param names - The name of the test and then of its ancestors
 */
export function matchesNamePattern(names: string[]) {
  const { namePattern } = config
  return (
    namePattern === null ||
    [
      ...names,
      ...names.map((_, i) => names.slice(i).toReversed().join(' ')),
    ].some((name) => name.search(namePattern) !== -1)
  )
}

export function indent(nesting: number) {
  return '  '.repeat(nesting)
}

/**
 * The line of a test in the `spec` reporter of `node:test`.
 */
export function formatTest(test: ReportedTest, nesting: number = 0) {
  const { message, name, passed, skip, time, todo } = test
  let color: 'gray' | 'green' | 'red' | 'yellow' = passed ? 'green' : 'red'
  let symbol = passed ? '✔' : '✖'
  let directive = ''
  if (skip) {
    color = 'gray'
    symbol = '﹣'
    directive = ` # ${message || 'SKIP'}`
  } else if (todo) {
    directive = ` # ${message || 'TODO'}`
    if (!passed) {
      color = 'yellow'
      symbol = '⚠'
    }
  }
  const duration =
    time === undefined
      ? ''
      : ` ${paint('gray', `(${Number(time.toFixed(6))}ms)`)}`
  return `${indent(nesting)}${paint(color, `${symbol} ${name}`)}${duration}${directive && paint(color, directive)}`
}

/** `fn@url:1:2`, `@url:1:2`, `fn@[native code]` or `fn@`. */
const NON_V8_FRAME = /^(.*?)@(.*:\d+:\d+|\[native code\])?\s*$/

function toV8Frame(line: string) {
  const match = line.match(NON_V8_FRAME)
  if (!match) {
    return line
  }
  const [, fn, location] = match
  if (location === undefined || location === '[native code]') {
    return `    at ${fn || '<anonymous>'} (<anonymous>)`
  }
  return `    at ${fn ? `${fn} (${location})` : location}`
}

/**
 * `inspect` expects a stack from V8, with the message and frames starting with
 * `    at`. Firefox and WebKit have neither, so it would leave the message out.
 */
function useV8Stack(error: unknown) {
  const seen = new Set()
  for (let e = error; e instanceof Error && !seen.has(e); e = e.cause) {
    seen.add(e)
    const { stack } = e
    if (stack && !stack.includes('\n    at ')) {
      const header = e.message ? `${e.name}: ${e.message}` : e.name
      const hasHeader = stack === header || stack.startsWith(`${header}\n`)
      const lines = (hasHeader ? stack.slice(header.length) : stack)
        .split('\n')
        .filter((line) => line.length > 0)
      if (lines.some((line) => NON_V8_FRAME.test(line))) {
        Reflect.set(e, 'stack', [header, ...lines.map(toV8Frame)].join('\n'))
      }
    }
  }
}

/**
 * Anything an error runs while it's shown can throw, and that can't get in the
 * way of reporting that the test failed. Node.js retries without the custom
 * inspector too, the rest is for what `inspect` itself reads.
 */
function inspectThrown(thrown: unknown) {
  const options = {
    breakLength: Number.POSITIVE_INFINITY,
    colors: !(thrown instanceof Error) && config.colors,
  }
  try {
    useV8Stack(thrown)
    return inspect(thrown, options)
  } catch {
    try {
      return inspect(thrown, { ...options, customInspect: false })
    } catch {
      try {
        const { name, message } = thrown as Error
        return `${name}: ${message}`
      } catch {
        return 'The error could not be shown'
      }
    }
  }
}

/**
 * What a test threw, the way the `spec` reporter of `node:test` shows it.
 */
function formatThrown(error: unknown) {
  const failure = error as
    | { code?: unknown; cause?: unknown }
    | null
    | undefined
  const thrown = failure?.code === 'ERR_TEST_FAILURE' ? failure.cause : error
  return cleanStack(inspectThrown(thrown)).replaceAll('\n', '\n  ')
}

/**
 * An entry in the list of failing tests.
 */
export function formatFailure(test: ReportedTest, error: unknown) {
  return `${formatTest(test)}\n  ${formatThrown(error)}\n`
}

export function formatDiagnostic(nesting: number, message: string) {
  return paint('blue', `${indent(nesting)}ℹ ${message}`)
}

/**
 * Set by `./test.ts` when it loads. In node mode without it `node:test` is the
 * real one, which runs and reports its tests by itself.
 */
let runTests: (() => Promise<RunResult>) | undefined

export function registerRun(run: () => Promise<RunResult>) {
  runTests = run
}

/**
 * Run the declared tests and report the results, like the `spec` reporter of
 * `node:test` does.
 */
export async function exec() {
  if (runTests === undefined) {
    return
  }
  const result = await runTests()
  const { cancelled, errors, failures } = result

  for (const [label, value] of [
    ['tests', result.total],
    ['suites', result.suites],
    ['pass', result.passes],
    ['fail', failures],
    ['cancelled', cancelled],
    ['skipped', result.skips],
    ['todo', result.todos],
    ['duration_ms', Number(result.duration.toFixed(6))],
  ]) {
    console.log(formatDiagnostic(0, `${label} ${value}`))
  }

  if (errors.length > 0) {
    console.log(`\n${paint('red', '✖ failing tests:')}\n`)
    console.log(errors.join('\n'))
  }

  // Only ever to fail, an exit code that was already set isn't ours to clear.
  if (failures + cancelled > 0 && typeof process !== 'undefined') {
    process.exitCode = 1
  }

  return result
}

let autoStart = true

/**
 * Don't run the tests by themselves, whoever calls this has to call {@link exec}.
 */
export function hold() {
  autoStart = false
}

/**
 * Run the tests, unless {@link hold} was called.
 */
export async function start() {
  if (autoStart) {
    await exec()
  }
}
