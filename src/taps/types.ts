import type assert from 'assert'

export type Fn = (test: Harness) => Promise<void> | void
export type Hook = () => Promise<void> | void
export type TestMethod = (name: string, fn: Fn) => void
export type HookMethod = (fn: Hook) => void

export interface Test {
  name: string
  fn: Fn
  skip: boolean
}

export type RunnerPartial = (
  testCount: number
) => Promise<[errors: string[], ran: number, skipped: number, total: number]>

export type Runner = (
  ctx: SuiteContext,
  testCount: number
) => Promise<[errors: string[], ran: number, skipped: number, total: number]>

export type Queue = RunnerPartial[]

export interface TestContext {
  name: string
  file: string
  suite: string
  number: number
  skip: boolean
}
export interface SuiteContext {
  name: string
  file: string
  tests: Test[]
  before: Hook[]
  after: Hook[]
  beforeEach: Hook[]
  afterEach: Hook[]
  only: Test[]
  skips: number
}

export interface Harness {
  (name: string, fn: Fn): void
  test: TestMethod
  only: TestMethod
  skip: TestMethod
  before: HookMethod
  after: HookMethod
  beforeEach: HookMethod
  afterEach: HookMethod
  ok: typeof assert.strict.ok
  equal: typeof assert.strict.equal
  notEqual: typeof assert.strict.notEqual
  deepEqual: typeof assert.strict.deepEqual
  notDeepEqual: typeof assert.strict.notDeepEqual
  throws: typeof assert.strict.throws
  rejects: typeof assert.strict.rejects
  doesNotThrow: typeof assert.strict.doesNotThrow
  doesNotReject: typeof assert.strict.doesNotReject
  fail: typeof assert.strict.fail
  ifError: typeof assert.strict.ifError
  match: typeof assert.strict.match
  doesNotMatch: typeof assert.strict.doesNotMatch
  subset: (actual: unknown, expected: unknown, msg?: string) => void
}
