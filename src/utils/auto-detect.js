import fs from 'fs'

import { parse } from 'acorn-loose'

/**
 *
 * @param {string} path
 * @param {Record<string, import('../types.js').TestRunner>} runners
 */
export function detectTestRunner(path, runners) {
  const contents = fs.readFileSync(path, 'utf8')
  const parsedCode = parse(contents, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })

  /** @type {string[]} */
  const ids = []

  // @ts-ignore
  for (const node of parsedCode.body) {
    if (
      node.type === 'ImportDeclaration' &&
      node.source.type === 'Literal' &&
      node.source.value &&
      typeof node.source.value === 'string'
    ) {
      ids.push(node.source.value)
    }

    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee &&
      node.expression.callee.type === 'Identifier' &&
      (node.expression.callee.name === 'describe' ||
        node.expression.callee.name === 'it')
    ) {
      ids.push('mocha')
    }

    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee &&
      node.expression.callee.type === 'MemberExpression' &&
      node.expression.callee.object &&
      // @ts-ignore
      node.expression.callee.object.name === 'describe' &&
      // @ts-ignore
      (node.expression.callee.property.name === 'only' ||
        // @ts-ignore
        node.expression.callee.property.name === 'skip')
    ) {
      ids.push('mocha')
    }

    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee &&
      node.expression.callee.type === 'MemberExpression' &&
      node.expression.callee.object &&
      // @ts-ignore
      node.expression.callee.object.name === 'it' &&
      // @ts-ignore
      (node.expression.callee.property.name === 'only' ||
        // @ts-ignore
        node.expression.callee.property.name === 'skip')
    ) {
      ids.push('mocha')
    }

    if (
      node.type === 'VariableDeclaration' &&
      node.declarations[0].init &&
      // @ts-ignore
      node.declarations[0].init.callee &&
      // @ts-ignore
      node.declarations[0].init.callee.name === 'require' &&
      // @ts-ignore
      node.declarations[0].init.arguments &&
      // @ts-ignore
      node.declarations[0].init.arguments[0].type === 'Literal'
    ) {
      // @ts-ignore
      ids.push(node.declarations[0].init.arguments[0].value)
    }
  }

  const runnerMap = new Map()
  for (const runner of Object.values(runners)) {
    runnerMap.set(runner.moduleId, runner)
  }

  const runnerId = ids.find((id) => runnerMap.has(id))

  return runnerId ? runnerMap.get(runnerId) : undefined
}
