import type { subset } from './assert.js'
import type _assert from 'assert'

export interface Assert {
  ok: typeof _assert.strict.ok
  equal: typeof _assert.strict.equal
  notEqual: typeof _assert.strict.notEqual
  deepEqual: typeof _assert.strict.deepEqual
  notDeepEqual: typeof _assert.strict.notDeepEqual
  throws: typeof _assert.strict.throws
  rejects: typeof _assert.strict.rejects
  doesNotThrow: typeof _assert.strict.doesNotThrow
  doesNotReject: typeof _assert.strict.doesNotReject
  fail: typeof _assert.strict.fail
  ifError: typeof _assert.strict.ifError
  match: typeof _assert.strict.match
  doesNotMatch: typeof _assert.strict.doesNotMatch
  subset: typeof subset
}

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
}
