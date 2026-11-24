import { parse } from 'acorn-loose'
import type { Loader } from 'esbuild'
import { transform } from 'esbuild'
import fs from 'fs/promises'
import path from 'path'
import { mocha, nodeTest } from '../test-runners.ts'
import type { TestRunner } from '../types.ts'

// acorn's types, `acorn` itself is only a dependency of `acorn-loose`
type Program = ReturnType<typeof parse>
type Statement = Program['body'][number]
type VariableDeclaration = Extract<Statement, { type: 'VariableDeclaration' }>
type Declarator = VariableDeclaration['declarations'][number]
type Pattern = Declarator['id']
type Expression = NonNullable<Declarator['init']>
type CallExpression = Extract<Expression, { type: 'CallExpression' }>
/** An expression, `super` or a spread argument */
type ExpressionLike =
  | CallExpression['callee']
  | CallExpression['arguments'][number]

const LOADERS: Record<string, Loader> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
}

/** What a file imports to ask for a runner. */
const RUNNER_MODULES = new Map(
  [mocha, nodeTest].flatMap((runner) =>
    [runner.moduleId, ...(runner.aliases ?? [])].map((id) => [id, runner])
  )
)

/** The mocha BDD globals, the only runner that's used without importing it. */
const MOCHA_GLOBALS = new Set(['describe', 'it'])
const MOCHA_GLOBAL_MODIFIERS = new Set(['only', 'skip'])

/**
 * Read a file as code the parser understands. Types and JSX are stripped first,
 * the parser doesn't know `import type` from an import and gets lost in
 * generics and JSX.
 *
 * Async on purpose: `transformSync` starts its own esbuild service and makes a
 * blocking round trip per file, the async `transform` reuses the service the
 * build starts anyway and runs the files in parallel.
 */
async function readSource(file: string) {
  const contents = await fs.readFile(file, 'utf8')
  const loader = LOADERS[path.extname(file)]
  if (!loader) {
    return contents
  }
  try {
    return (await transform(contents, { loader })).code
  } catch {
    return contents
  }
}

/**
 * The module an expression gets its value from: `require('a')`, `require('a').b`,
 * `await import('a')` and `import('a').then(fn)` are all from `a`.
 */
function moduleOf(node: ExpressionLike | null | undefined): string | undefined {
  while (node) {
    if (node.type === 'AwaitExpression') {
      node = node.argument
    } else if (node.type === 'MemberExpression') {
      node = node.object
    } else if (node.type === 'ImportExpression') {
      return literal(node.source)
    } else if (node.type === 'CallExpression') {
      if (node.callee.type === 'Identifier') {
        return node.callee.name === 'require'
          ? literal(node.arguments[0])
          : undefined
      }
      node = node.callee
    } else {
      return undefined
    }
  }
}

function literal(node: ExpressionLike | null | undefined) {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : undefined
}

/**
 * The names a binding pattern declares.
 */
function patternNames(pattern: Pattern | null): string[] {
  switch (pattern?.type) {
    case 'Identifier': {
      return [pattern.name]
    }
    case 'ObjectPattern': {
      return pattern.properties.flatMap((property) =>
        patternNames(property.type === 'Property' ? property.value : property)
      )
    }
    case 'ArrayPattern': {
      return pattern.elements.flatMap(patternNames)
    }
    case 'AssignmentPattern': {
      return patternNames(pattern.left)
    }
    case 'RestElement': {
      return patternNames(pattern.argument)
    }
    default: {
      return []
    }
  }
}

/**
 * The names a top level statement declares.
 */
function declaredNames(node: Statement): string[] {
  switch (node.type) {
    case 'ImportDeclaration': {
      return node.specifiers.map((specifier) => specifier.local.name)
    }
    case 'VariableDeclaration': {
      return node.declarations.flatMap((declaration) =>
        patternNames(declaration.id)
      )
    }
    case 'FunctionDeclaration':
    case 'ClassDeclaration': {
      return node.id ? [node.id.name] : []
    }
    case 'ExportNamedDeclaration': {
      return node.declaration ? declaredNames(node.declaration) : []
    }
    default: {
      return []
    }
  }
}

/**
 * The name of the global a top level `describe()`, `it()`, `describe.only()` or
 * `it.skip()` statement calls.
 */
function calledGlobal(node: Statement) {
  if (
    node.type !== 'ExpressionStatement' ||
    node.expression.type !== 'CallExpression'
  ) {
    return
  }
  const { callee } = node.expression
  if (callee.type === 'Identifier') {
    return callee.name
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    'name' in callee.property &&
    MOCHA_GLOBAL_MODIFIERS.has(callee.property.name)
  ) {
    return callee.object.name
  }
}

/**
 * The modules a file imports, and `mocha` if it calls its globals.
 */
function evidence(source: string): Set<string> {
  const { body } = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const declared = new Set(body.flatMap(declaredNames))
  const ids: Set<string> = new Set()

  for (const node of body) {
    const expressions =
      node.type === 'VariableDeclaration'
        ? node.declarations.map((d) => d.init)
        : node.type === 'ExpressionStatement'
          ? [node.expression]
          : []
    const modules = [
      node.type === 'ImportDeclaration' ? literal(node.source) : undefined,
      ...expressions.map(moduleOf),
    ]
    for (const id of modules) {
      if (id) {
        ids.add(id)
      }
    }

    // `describe` that comes from anywhere else isn't mocha, see `declared`
    const name = calledGlobal(node)
    if (name && MOCHA_GLOBALS.has(name) && !declared.has(name)) {
      ids.add('mocha')
    }
  }
  return ids
}

/**
 * Find which runners the test files ask for. A file only counts when it imports
 * the module of a runner, exactly, or calls the mocha globals. Anything else
 * tells nothing about the runner, so the caller should fall back to `none`.
 *
 * All the files are read since the first one can be a helper.
 *
 * @returns each runner found and the first file asking for it
 */
export async function detectTestRunners(
  files: string[]
): Promise<Map<TestRunner, string>> {
  const sources = await Promise.all(
    files.map(async (file) => [file, await readSource(file)] as const)
  )
  const found: Map<TestRunner, string> = new Map()
  for (const [file, source] of sources) {
    for (const id of evidence(source)) {
      const runner = RUNNER_MODULES.get(id)
      if (runner && !found.has(runner)) {
        found.set(runner, file)
      }
    }
  }
  return found
}
