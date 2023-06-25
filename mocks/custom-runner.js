/** @type {import('./types.js').TestRunner<{}>} */
export const none = {
  options: {},
  compileRuntime(options, paths) {
    return `
${paths.map((url) => `await import('${url}')`).join('\n')}
`
  },
}

export const playwrightTestRunner = none
