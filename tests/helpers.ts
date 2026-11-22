import os from 'node:os'
import { mock } from 'node:test'
import type { Options, ResultPromise } from 'execa'
import { execa as baseExeca, execaSync as baseExecaSync } from 'execa'

// Bounded in-file concurrency: paired with `--test-concurrency=3` in package.json,
// this keeps total concurrent browsers safe on 4-vCPU CI runners (3x2 = 6) while
// scaling with available cores locally.
export const TEST_CONCURRENCY = process.env.CI
  ? 2
  : Math.min(3, Math.max(2, Math.floor(os.availableParallelism() / 3)))

// `node --test` runs each file with NODE_TEST_CONTEXT=child-v8. Children would inherit
// it, and it changes the output of the real `node:test` runs in the fixtures.
//
// Browsers keep their profile in the temp folder, see PW_TEST_CHILD_TEMP in the
// workflow. Only children get it, find-tests.test.ts needs its own temp folder in
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
 */
export function runCli<T extends Options = Record<never, never>>(
  args: string[],
  cliOptions?: T
): ResultPromise<T> {
  // The options of `execa` only add the env, the result is the same
  return execa(
    './src/bin.ts',
    args,
    cliOptions ?? ({} as T)
  ) as unknown as ResultPromise<T>
}

/**
 * Resolve the options of the CLI in this process, for tests of the flags and the
 * config file that don't need a run. Not for tests that run concurrently, it
 * takes over the console to return what was logged.
 */
export async function resolveCli(args: string[]) {
  // Not at the top, std-env reads the agent variables when it loads and they
  // have to be gone by then, see below
  const { resolveOptions } = await import('../src/cli-options.ts')
  const logs: string[] = []
  const record = (...parts: unknown[]) => {
    logs.push(parts.join(' '))
  }
  const error = mock.method(console, 'error', record)
  const warn = mock.method(console, 'warn', record)
  try {
    const resolved = await resolveOptions(args)
    if (!resolved) {
      throw new Error(`Nothing to run with ${args.join(' ')}`)
    }
    return { ...resolved, logs: logs.join('\n') }
  } finally {
    error.mock.restore()
    warn.mock.restore()
  }
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
