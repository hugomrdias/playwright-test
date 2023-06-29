export type Fn = (test: TestContext) => Promise<void> | void
export interface Test {
  name: string
  fn: Fn
  skip: boolean
}

export type Hook = (ctx: SuiteContext) => Promise<void> | void

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
