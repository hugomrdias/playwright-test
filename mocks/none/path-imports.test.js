import fromNode, { join } from 'node:path'
import fromNodePosix from 'node:path/posix'
import fromBare from 'path'
import fromBareSlash from 'path/'
import fromPosix from 'path/posix'

const fromRequire = require('path')

const checks = {
  'node:path is path': fromNode === fromBare,
  'node:path/posix is path': fromNodePosix === fromBare,
  'path/ is path': fromBareSlash === fromBare,
  'path/posix is path': fromPosix === fromBare,
  'require is path': fromRequire === fromBare,
  'posix is path': fromBare.posix === fromBare,
  'named join works': join('a', '..', 'b') === 'b',
  'separator is posix': fromBare.sep === '/',
  'resolve uses the process cwd': fromBare.resolve('a') === '/a',
}

const failed = Object.entries(checks).filter(([, passed]) => !passed)

if (failed.length > 0) {
  process.stderr.write(`${failed.map(([name]) => name).join('\n')}\n`)
  process.exit(1)
} else {
  process.stdout.write('imports are fine\n')
  process.exit(0)
}
