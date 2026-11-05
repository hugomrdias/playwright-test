import { execa as baseExeca, execaSync as baseExecaSync } from 'execa'

// `node --test` runs each file with NODE_TEST_CONTEXT=child-v8. Children would inherit
// it, and it changes the output of the real `node:test` runs in the fixtures.
const options = { env: { NODE_TEST_CONTEXT: undefined } }

export const execa = baseExeca(options)
export const execaSync = baseExecaSync(options)
