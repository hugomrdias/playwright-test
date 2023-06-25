/** @type {import('../src/runner.js').RunnerOptions} */
const config = {
  testRunner: {
    compileRuntime: (options, paths) => {
      return `
import mocha from 'mocha/mocha.js'
mocha.setup({
    reporter: 'spec',
    timeout: 5000,
    ui: 'bdd',
})

${paths.map((url) => `await import('${url}')`).join('\n')}

  mocha
    .run((f) =>{
      process.exit(f)
    })
        `
    },
  },
}

export default config
