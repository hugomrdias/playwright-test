import { createHarness, createTAPReporter } from 'zora'

globalThis.RUN_ONLY = process.env.RUN_ONLY === 'true'
const harness = createHarness({
  onlyMode: process.env.RUN_ONLY === 'true',
})

// // @ts-ignore
globalThis.zora = harness
globalThis.zoraReporter = createTAPReporter()

export const test = harness.test
export const only = harness.only
export const skip = harness.skip
export const report = harness.report

export {
  createHarness,
  createTAPReporter,
  createJSONReporter,
  Assert,
} from 'zora'
