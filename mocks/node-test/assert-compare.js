/** biome-ignore-all lint/suspicious/noConsole: reports to the terminal */
/**
 * Compares `src/taps/node-assert.js` in browsers with the real `node:assert` in
 * Node.js: verdict, `name`, `code`, `operator` and `generatedMessage` of every
 * case in `assert-cases.js`. Any difference exits with 1.
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

/**
 * @param {string} file
 * @param {string[]} [flags]
 */
async function collect(file, flags = []) {
  const args = flags.length > 0 ? ['cli.js', file, ...flags] : [file]
  const proc = await execa(process.execPath, args, { cwd, reject: false })
  const cases = new Map()
  let impl
  let done = false
  for (const line of proc.stdout.split(/\r?\n/)) {
    if (line.startsWith('CASE ')) {
      const json = line.lastIndexOf(' {')
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
    if (real.get(key) !== cases.get(key)) {
      console.log(
        `${label}: ${key}\n  node:   ${real.get(key)}\n  module: ${cases.get(key)}`
      )
      failures++
    }
  }
  console.log(`${label}: ${cases.size} cases, ${failures} differences`)
  return failures
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
