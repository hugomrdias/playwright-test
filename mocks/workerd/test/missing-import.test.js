import { it } from 'node:test'
import './does-not-exist.js'

it('never runs', () => {
  // The import fails first
})
