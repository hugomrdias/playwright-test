/**
 * Where `playwright-test/node-test` keeps a function that gives the full name of
 * the running test, under `Symbol.for()`, for the runner to tell which one hung.
 */
export const RUNNING_TEST_KEY = 'playwright-test.runningTest'
