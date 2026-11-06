import { parse } from 'acorn-loose'
import { transformSync } from 'esbuild'
import fs from 'fs'
import path from 'path'

/**
 * @typedef {import('../types.js').TestRunner} TestRunner
 */

/** @type {Record<string, import('esbuild').Loader>} */
const TS_LOADERS = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
}

/** The mocha BDD globals, the only runner that's used without importing it. */
const MOCHA_GLOBALS = new Set(['describe', 'it'])
const MOCHA_GLOBAL_MODIFIERS = new Set(['only', 'skip'])

/**
 * Read a file as code the parser understands. Types are stripped first, the
 * parser doesn't know `import type` from an import and gets lost in generics.
 *
 * @param {string} file
 */
function readSource(file) {
  const contents = fs.readFileSync(file, 'utf8')
  const loader = TS_LOADERS[path.extname(file)]
  if (!loader) {
    return contents
  }
  try {
    return transformSync(contents, { loader }).code
  } catch {
    return contents
  }
}

/**
 * The module an expression gets its value from: `require('a')`, `require('a').b`,
 * `await import('a')` and `import('a').then(fn)` are all from `a`.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function moduleOf(node) {
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

/**
 * @param {any} node
 */
function literal(node) {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : undefined
}

/**
 * The names a binding pattern declares.
 *
 * @param {any} pattern
 * @returns {string[]}
 */
function patternNames(pattern) {
  switch (pattern?.type) {
    case 'Identifier': {
      return [pattern.name]
    }
    case 'ObjectPattern': {
      return pattern.properties.flatMap((/** @type {any} */ property) =>
        patternNames(property.value ?? property)
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
 *
 * @param {any} node
 * @returns {string[]}
 */
function declaredNames(node) {
  switch (node.type) {
    case 'ImportDeclaration': {
      return node.specifiers.map(
        (/** @type {any} */ specifier) => specifier.local.name
      )
    }
    case 'VariableDeclaration': {
      return node.declarations.flatMap((/** @type {any} */ declaration) =>
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
 *
 * @param {any} node
 */
function calledGlobal(node) {
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
    MOCHA_GLOBAL_MODIFIERS.has(callee.property.name)
  ) {
    return callee.object.name
  }
}

/**
 * The modules a file imports, and `mocha` if it calls its globals.
 *
 * @param {string} file
 * @returns {Set<string>}
 */
function evidence(file) {
  const { body } = parse(readSource(file), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const declared = new Set(body.flatMap(declaredNames))
  /** @type {Set<string>} */
  const ids = new Set()

  for (const node of /** @type {any[]} */ (body)) {
    const expressions =
      node.type === 'VariableDeclaration'
        ? node.declarations.map((/** @type {any} */ d) => d.init)
        : [node.expression]
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
 * @param {string[]} files
 * @param {Record<string, TestRunner>} runners
 * @returns {Map<TestRunner, string>} each runner found and the first file asking for it
 */
export function detectTestRunners(files, runners) {
  /** @type {Map<string, TestRunner>} */
  const byId = new Map()
  for (const runner of Object.values(runners)) {
    if (runner !== runners.none) {
      for (const id of [runner.moduleId, ...(runner.aliases ?? [])]) {
        byId.set(id, runner)
      }
    }
  }

  /** @type {Map<TestRunner, string>} */
  const found = new Map()
  for (const file of files) {
    for (const id of evidence(file)) {
      const runner = byId.get(id)
      if (runner && !found.has(runner)) {
        found.set(runner, file)
      }
    }
  }
  return found
}
