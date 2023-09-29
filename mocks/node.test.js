import { equal } from '../src/taps/assert.js'
import path from 'node:path'
import { fileURLToPath } from 'url'

describe('Node', () => {
  it('should test node builtins', () => {
    path.sep = 'foo'

    fileURLToPath('file:///home/user/dir/file.txt')
    equal(path.sep, 'foo')
    equal(
      fileURLToPath('file:///home/user/dir/file.txt'),
      '/home/user/dir/file.txt'
    )
  })
})
