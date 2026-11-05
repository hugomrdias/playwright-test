import fromNode, { cwd, env, nextTick, stdout } from 'node:process'
import fromBare from 'process'
import fromBareSlash from 'process/'
import fromBrowser from 'process/browser'
import fromBrowserJs from 'process/browser.js'

const fromRequire = require('process')

const checks = {
  'node:process is the global': fromNode === process,
  'process is the global': fromBare === process,
  'process/ is the global': fromBareSlash === process,
  'process/browser is the global': fromBrowser === process,
  'process/browser.js is the global': fromBrowserJs === process,
  'require has nextTick': fromRequire.nextTick === process.nextTick,
  'named env has the runner env': typeof env.PW_OPTIONS === 'string',
  'named env is the global env': env === process.env,
  'named nextTick is the global one': nextTick === process.nextTick,
  'named stdout is the global one': stdout === process.stdout,
  'named cwd works': cwd() === '/',
  // Only `process` is injected, other names stay free
  'exit is not injected': typeof exit === 'undefined',
  'emit is not injected': typeof emit === 'undefined',
  'title is not injected': typeof title === 'undefined',
  'umask is not injected': typeof umask === 'undefined',
  'hrtime is not injected': typeof hrtime === 'undefined',
}

const failed = Object.entries(checks).filter(([, passed]) => !passed)

if (failed.length > 0) {
  process.stderr.write(`${failed.map(([name]) => name).join('\n')}\n`)
  process.exit(1)
} else {
  process.stdout.write('imports are fine\n')
  process.exit(0)
}
