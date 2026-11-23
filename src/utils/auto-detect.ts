import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'acorn-loose'
import type { Loader, Plugin } from 'esbuild'
import { build, transformSync } from 'esbuild'
import fs from 'fs'
import path from 'path'
import { mocha, nodeTest } from '../test-runners.ts'
import type { RunnerOptions, TestRunner } from '../types.ts'

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

const SOURCE_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.mts',
  '.cjs',
  '.cts',
]
type Dependency = {
  id: string
  kind: 'import-statement' | 'dynamic-import' | 'require-call'
}
type ResolveSource = (
  file: string,
  dependency: Dependency
) => string | undefined | Promise<string | undefined>

function resolveNodeSource(file: string, { id, kind }: Dependency) {
  try {
    if (kind === 'require-call') {
      return createRequire(file).resolve(id)
    }
    const target = fileURLToPath(new URL(id, pathToFileURL(file)))
    return fs.statSync(target, { throwIfNoEntry: false })?.isFile()
      ? target
      : undefined
  } catch {
    return undefined
  }
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
 */
function readSource(file: string) {
  const contents = fs.readFileSync(file, 'utf8')
  const loader = LOADERS[path.extname(file)]
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
 */
function moduleOf(
  node: ExpressionLike | null | undefined
): Dependency | undefined {
  while (node) {
    if (node.type === 'AwaitExpression') {
      node = node.argument
    } else if (node.type === 'MemberExpression') {
      node = node.object
    } else if (node.type === 'ImportExpression') {
      const id = literal(node.source)
      return id ? { id, kind: 'dynamic-import' } : undefined
    } else if (node.type === 'CallExpression') {
      if (node.callee.type === 'Identifier') {
        const id = node.callee.name === 'require' && literal(node.arguments[0])
        return id ? { id, kind: 'require-call' } : undefined
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
function evidence(file: string): Dependency[] {
  const { body } = parse(readSource(file), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const declared = new Set(body.flatMap(declaredNames))
  const dependencies: Dependency[] = []

  for (const node of body) {
    const expression =
      node.type === 'ExpressionStatement' ? node.expression : undefined
    const expressions =
      node.type === 'VariableDeclaration'
        ? node.declarations.map((d) => d.init)
        : [
            expression?.type === 'AssignmentExpression'
              ? expression.right
              : expression,
          ]
    const imported =
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration'
        ? literal(node.source)
        : undefined
    if (imported) {
      dependencies.push({ id: imported, kind: 'import-statement' })
    }
    for (const expression of expressions) {
      const dependency = moduleOf(expression)
      if (dependency) {
        dependencies.push(dependency)
      }
    }

    // `describe` that comes from anywhere else isn't mocha, see `declared`
    const name = calledGlobal(node)
    if (name && MOCHA_GLOBALS.has(name) && !declared.has(name)) {
      dependencies.push({ id: 'mocha', kind: 'import-statement' })
    }
  }
  return dependencies
}

/**
 * Find which runners the test files ask for. A file only counts when it imports
 * the module of a runner, exactly, or calls the mocha globals. Anything else
 * tells nothing about the runner, so the caller should fall back to `none`.
 *
 * Entry files and their relative source dependencies are read.
 *
 * @returns each runner found and the first file asking for it
 */
export async function detectTestRunners(
  files: string[],
  options: Pick<RunnerOptions, 'mode' | 'cwd'> &
    Partial<Pick<RunnerOptions, 'buildConfig'>>
): Promise<Map<TestRunner, string>> {
  if (options.mode === 'node' || files.length === 0) {
    return scanTestRunners(files, resolveNodeSource)
  }

  const workerd = options.mode === 'workerd'
  const config = options.buildConfig
  let found: Map<TestRunner, string> = new Map()
  await build({
    absWorkingDir: config?.absWorkingDir,
    stdin: {
      contents: 'import "runner-autodetection"',
      resolveDir: options.cwd,
    },
    bundle: true,
    write: false,
    logLevel: 'silent',
    platform: config?.platform ?? (workerd ? 'neutral' : 'browser'),
    mainFields:
      config?.mainFields ??
      (workerd ? ['browser', 'module', 'main'] : undefined),
    conditions:
      config?.conditions ??
      (workerd ? ['workerd', 'worker', 'browser'] : undefined),
    resolveExtensions: config?.resolveExtensions,
    tsconfig: config?.tsconfig,
    tsconfigRaw: config?.tsconfigRaw,
    preserveSymlinks: config?.preserveSymlinks,
    external: config?.external,
    plugins: [
      {
        name: 'runner-autodetection',
        setup(build) {
          build.onResolve({ filter: /^runner-autodetection$/ }, () => ({
            path: 'runner-autodetection',
            namespace: 'runner-autodetection',
          }))
          build.onLoad(
            { filter: /.*/, namespace: 'runner-autodetection' },
            async () => {
              found = await scanTestRunners(
                files,
                async (file, { id, kind }) => {
                  const result = await build.resolve(id, {
                    importer: file,
                    resolveDir: path.dirname(file),
                    namespace: 'file',
                    kind,
                  })
                  if (
                    !result.external &&
                    result.namespace === 'file' &&
                    !result.suffix
                  ) {
                    return result.path
                  }
                },
                config?.preserveSymlinks
              )
              return { contents: '' }
            }
          )
        },
      },
      ...(config?.plugins ?? []).map<Plugin>((plugin) => ({
        name: plugin.name,
        setup(build) {
          // Detection has no output bundle for plugin hooks to consume.
          return plugin.setup({ ...build, onEnd: () => undefined })
        },
      })),
    ],
  })
  return found
}

async function scanTestRunners(
  files: string[],
  resolveSource: ResolveSource,
  preserveSymlinks = false
) {
  const found: Map<TestRunner, string> = new Map()
  const pending = [...files]
  const visited = new Set<string>()
  for (const file of pending) {
    const modulePath = preserveSymlinks
      ? path.resolve(file)
      : fs.realpathSync(file)
    if (visited.has(modulePath)) {
      continue
    }
    visited.add(modulePath)
    for (const dependency of evidence(modulePath)) {
      const { id } = dependency
      const runner = RUNNER_MODULES.get(id)
      if (runner) {
        if (!found.has(runner)) {
          found.set(runner, file)
        }
      } else if (
        id.startsWith('./') ||
        id.startsWith('../') ||
        id === '.' ||
        id === '..'
      ) {
        const resolved = await resolveSource(modulePath, dependency)
        if (resolved && SOURCE_EXTENSIONS.includes(path.extname(resolved))) {
          pending.push(resolved)
        }
      }
    }
  }
  return found
}
