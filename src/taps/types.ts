/* eslint-disable @typescript-eslint/ban-types */
import type _assert from 'assert'
import type { instance, subset, type } from './assert'

export interface TypeMap {
  boolean: boolean
  number: number
  string: string
  object: object
  undefined: undefined
  function: Function
}

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
  type: typeof type
  instance: typeof instance
}

export type Fn = () => Promise<void> | void
export type Hook = () => Promise<void> | void
export type TestMethod = (
  name: string,
  fn: Fn,
  options?: Test['options']
) => void
export type HookMethod = (fn: Hook) => void

export interface Test {
  name: string
  fn: Fn
  options: {
    skip?: boolean
    only?: boolean
    timeout?: number
  }
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
  suite: string
  number: number
  skip: boolean
}
export interface SuiteContext {
  name: string
  tests: Test[]
  before: Hook[]
  after: Hook[]
  beforeEach: Hook[]
  afterEach: Hook[]
  only: Test[]
  skips: number
}

export interface Suite {
  (name: string, fn: Fn, options?: Test['options']): void
  test: TestMethod
  only: TestMethod
  skip: TestMethod
  before: HookMethod
  after: HookMethod
  beforeEach: HookMethod
  afterEach: HookMethod
}
