/** biome-ignore-all lint/suspicious/noConsole: reports to the terminal */
/**
 * Compares our `assert` and `util` in browsers with the real ones in Node.js: every
 * field of every case in `assert-cases.js` and `util-cases.js`. Any difference exits
 * with 1, apart from the messages in `MESSAGE_CAN_DIFFER`.
 *
 * Runs in chromium when run without arguments, otherwise pass what's for the CLI:
 *
 *   node mocks/node-test/assert-compare.js --browser webkit
 */
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

// The CLI takes globs, which can't be absolute paths with backslashes on Windows.
const cwd = fileURLToPath(new URL('../..', import.meta.url))
const fixture = (name) => `mocks/node-test/assert-${name}.test.js`

// Forcing colors adds them to the messages of the real modules, like in CI. Ours never
// have them because there's no terminal in a browser.
const { FORCE_COLOR, ...env } = process.env

/**
 * @param {string} file
 * @param {string[]} [flags]
 */
async function collect(file, flags = []) {
  const args = flags.length > 0 ? ['cli.js', file, ...flags] : [file]
  const proc = await execa(process.execPath, args, {
    cwd,
    env,
    extendEnv: false,
    reject: false,
  })
  const cases = new Map()
  let impl
  let done = false
  for (const line of proc.stdout.split(/\r?\n/)) {
    if (line.startsWith('CASE ')) {
      const json = line.indexOf(' {"verdict"')
      cases.set(line.slice(5, json), line.slice(json + 1))
    } else if (line.startsWith('IMPL ')) {
      impl = line.slice(5)
    } else if (line === 'CASES DONE') {
      done = true
    }
  }
  if (!done || proc.exitCode !== 0) {
    throw new Error(
      `${args.join(' ')} exited with ${proc.exitCode} after ${cases.size} cases\n${proc.stderr}`
    )
  }
  return { cases, impl }
}

/**
 * @param {string} label
 * @param {Map<string, string>} real
 * @param {Awaited<ReturnType<typeof collect>>} other
 */
function compare(label, real, { cases, impl }) {
  let failures = 0
  if (impl !== 'browser') {
    console.log(`${label}: ran "${impl}", not the browser implementation`)
    failures++
  }
  for (const key of new Set([...real.keys(), ...cases.keys()])) {
    const canDiffer =
      real.has(key) &&
      cases.has(key) &&
      MESSAGE_CAN_DIFFER.some((regex) => regex.test(key))
    const same = canDiffer
      ? withoutMessage(real.get(key)) === withoutMessage(cases.get(key))
      : real.get(key) === cases.get(key)
    if (!same) {
      console.log(
        `${label}: ${key}\n  node:   ${real.get(key)}\n  module: ${cases.get(key)}`
      )
      failures++
    }
  }
  console.log(`${label}: ${cases.size} cases, ${failures} differences`)
  return failures
}

/**
 * Messages that can't be the same, everything else about these cases still has to be.
 */
const MESSAGE_CAN_DIFFER = [
  // Node.js reads the expression from the source code.
  /^(legacy|strict) (ok\(0\)|assert\(0\))$/,
  // There's no way to read the state of a promise in a browser.
  /Promise/,
  // They have a stack trace, with paths and frames that depend on the engine.
  /Error|cause/,
]

const withoutMessage = (/** @type {string} */ json) => {
  const { message, string, ...rest } = JSON.parse(json)
  return JSON.stringify(rest)
}

const flags = process.argv.slice(2)
const { cases: real } = await collect(fixture('real'))
if (real.size === 0) {
  throw new Error('No cases from the real node:assert')
}

let failures = 0
if (flags.length === 0) {
  // The browser implementation running in Node.js, without a browser or a bundle.
  failures += compare('node', real, await collect(fixture('polyfill')))
}
for (const mode of ['main', 'worker']) {
  failures += compare(
    mode,
    real,
    await collect(fixture('entrypoint'), [
      '--runner',
      'none',
      '--mode',
      mode,
      ...flags,
    ])
  )
}

process.exit(failures > 0 ? 1 : 0)
