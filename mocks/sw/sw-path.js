import { join } from 'node:path'
import path from 'path'

if (join('a', 'b') !== path.join('a', 'b')) {
  throw new Error('node:path and path are different')
}
