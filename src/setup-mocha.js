// @ts-nocheck

/* eslint-disable no-undef */

// mocha library itself, to have it set up on global
import 'mocha/mocha'

const {
  allowUncaught,
  bail,
  reporter,
  timeout,
  color,
  ui,
  grep,
} = process.env.PW_TEST.runnerOptions

mocha.setup({
  allowUncaught,
  bail,
  reporter,
  timeout,
  color,
  ui,
  grep,
})
