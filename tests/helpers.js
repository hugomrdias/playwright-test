import os from 'node:os'
import { execa as baseExeca, execaSync as baseExecaSync } from 'execa'

// Bounded in-file concurrency: paired with file concurrency in tests/run.js,
// this keeps total concurrent browsers safe on 4-vCPU CI runners (~4-6) while
// scaling with available cores locally.
export const TEST_CONCURRENCY = process.env.CI
  ? 2
  : Math.min(3, Math.max(2, Math.floor(os.availableParallelism() / 3)))

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

// Runs started from an AI agent must report like any other, tests opt in with `AI_AGENT`.
for (const name of [
  'AI_AGENT',
  'AUGMENT_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'COPILOT_AGENT',
  'COPILOT_CLI',
  'CURSOR_AGENT',
  'GEMINI_CLI',
  'GOOSE_PROVIDER',
  'JUNIE_DATA',
  'JUNIE_SHIM_PATH',
  'OPENCODE',
  'REPL_ID',
]) {
  delete process.env[name]
}
