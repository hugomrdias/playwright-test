/* eslint-disable no-unsafe-finally */
/* eslint-disable no-console */
import kleur from 'kleur'
import { TAPS_QUEUE, suite } from './harness.js'
import { HAS_PROCESS, IS_ENV_WITH_DOM, IS_NODE, hrtime } from './utils.js'

export const test = suite()

export { suite } from './harness.js'

export * from './assert.js'

/**
 * Execute the queued tests.
 */
export async function exec() {
  const timer = hrtime()
  let passes = 0
  let total = 0
  let skips = 0
  let code = 0

  /** @type {string[]} */
  let errors = []

  for (const runner of TAPS_QUEUE) {
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
    console.log(kleur.yellow(`  ${skips} skipping`))
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

let autoStart = true

export function hold() {
  autoStart = false
}

async function start() {
  if (autoStart) {
    await exec()
  }
}

if (IS_ENV_WITH_DOM) {
  window.addEventListener('load', start)
}

if (IS_NODE && process.argv0 === 'node') {
  const { createHook } = await import('node:async_hooks')
  createHook({ init() {} }).enable() // forces PromiseHooks to be enabled.
  setTimeout(start, 0)
}
