import { execa as baseExeca, execaSync as baseExecaSync } from 'execa'

// `node --test` runs each file with NODE_TEST_CONTEXT=child-v8. Children would inherit
// it, and it changes the output of the real `node:test` runs in the fixtures.
//
// Browsers keep their profile in the temp folder, see PW_TEST_CHILD_TEMP in the
// workflow. Only children get it, find-tests.test.js needs its own temp folder in
// another drive.
const temp = process.env.PW_TEST_CHILD_TEMP
const options = {
  env: {
    NODE_TEST_CONTEXT: undefined,
    ...(temp ? { TEMP: temp, TMP: temp } : {}),
  },
}

export const execa = baseExeca(options)
export const execaSync = baseExecaSync(options)

/**
 * Run the CLI from the root of the repo.
 *
 * @template {import('execa').Options} [T={}]
 * @param {string[]} args
 * @param {T} [cliOptions]
 * @returns {import('execa').ResultPromise<T>}
 */
export function runCli(args, cliOptions) {
  return /** @type {any} */ (execa('./cli.js', args, cliOptions ?? {}))
}
