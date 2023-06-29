/* eslint-disable no-unsafe-finally */
/* eslint-disable no-console */
import kleur from 'kleur'
import { harness } from './harness.js'
import { HAS_PROCESS, IS_ENV_WITH_DOM, IS_NODE, hrtime } from './utils.js'

export const suite = (name = '') => {
  return harness(name)
}
export const test = harness('default')

let autoStart = true

export function hold() {
  autoStart = false
}

/**
 * Execute the queued tests.
 *
 * @param {any} bail
 */
export async function exec(bail) {
  if (!autoStart) return
  const timer = hrtime()
  let passes = 0
  let total = 0
  let skips = 0
  let code = 0

  /** @type {string[]} */
  let errors = []

  for (const runner of globalThis.UVU_QUEUE) {
    const [errs, ran, skip, max] = await runner(total)
    total += max
    passes += ran
    skips += skip
    errors = [...errors, ...errs]
  }

  // report
  if (passes > 0) {
    console.log(
      '\n' + kleur.green(`  ${passes} passing`),
      kleur.gray(`(${timer()})`)
    )
  }
  if (skips > 0) {
    console.log(kleur.yellow(`  ${passes} skipping`))
  }
  if (errors.length > 0) {
    console.log(kleur.red(`  ${total - skips - passes} failing`))
  }

  // errors
  if (errors.length > 0) {
    console.log(errors.join('\n'))
    code = 1
  }

  if (HAS_PROCESS) {
    process.exitCode = code
  }
  return {
    total,
    done: passes,
    skips,
    errors,
  }
}

if (IS_ENV_WITH_DOM) {
  window.addEventListener('load', exec)
}

if (IS_NODE && process.argv0 === 'node') {
  setTimeout(exec, 0)
}

/** @type {import('../types').TestRunner} */
export const none = {
  options: {},
  compileRuntime(options, paths) {
    return `
process.env.FORCE_COLOR = 1
const {exec} = await import('/Users/hd/code/playwright-test/src/taps/index.js')
${paths.map((url) => `await import('${url}')`).join('\n')}

exec().then(() => {
    process.exit(process.exitCode)
})
`
  },
}

export const playwrightTestRunner = none
