/**
 * Preloaded with `--import` in the files `node --test` runs on their own, so the
 * ones on `playwright-test/node-test` get the options of the run too.
 */
import { configure } from './test-harness.ts'

if (process.env.PW_OPTIONS) {
  configure(JSON.parse(process.env.PW_OPTIONS))
}
