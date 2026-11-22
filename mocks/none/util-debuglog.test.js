import { debuglog } from 'node:util'

const appHttp = debuglog('app-http')
const appUpper = debuglog('APP-HTTP')
const otherApp = debuglog('other-app')
const literalDot = debuglog('a.b')
const nonMatchingDash = debuglog('a-b')
const wildcardSection = debuglog('a*')

const checks = {
  'app* matches app-http': appHttp.enabled === true,
  'app* matches APP-HTTP case-insensitively': appUpper.enabled === true,
  'app* does not match other-app': otherApp.enabled === false,
  'a.b matches a.b literally': literalDot.enabled === true,
  'a.b does not match a-b': nonMatchingDash.enabled === false,
  'section wildcard does not match NODE_DEBUG':
    wildcardSection.enabled === false,
}

appHttp('hello %d', 1)
otherApp('should not print')

const failed = Object.entries(checks).filter(([, passed]) => !passed)

if (failed.length > 0) {
  process.stderr.write(`${failed.map(([name]) => name).join('\n')}\n`)
  process.exit(1)
} else {
  process.stdout.write('debuglog is fine\n')
  process.exit(0)
}
