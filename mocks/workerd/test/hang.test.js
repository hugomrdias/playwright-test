import { it } from 'node:test'

it('never settles', () =>
  new Promise(() => {
    // Nothing resolves it
  }))
