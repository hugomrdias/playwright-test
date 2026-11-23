// Closes the test page once the tests run, like --debug users closing the tab.
// Browsers don't let the tests close it themselves.
import { Runner } from '../../src/runner.ts'

const runner = new Runner({
  runner: 'none',
  input: ['mocks/flow/never-ends.js'],
  debug: process.argv.includes('--debug'),
})
const setupPage = runner.setupPage.bind(runner)
runner.setupPage = async (context) => {
  const page = await setupPage(context)
  page.on('console', (msg) => {
    if (msg.text() === 'flow-running') {
      page.close()
    }
  })
  return page
}
await runner.run()
