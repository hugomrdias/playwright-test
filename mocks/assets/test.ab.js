/* eslint-disable no-undef */
// eslint-disable-next-line strict
const { is } = require('uvu/assert')

describe('assets', () => {
  it('can fetch a, b and package.json', async () => {
    // assets from cwd is available
    is(
      await fetch(new URL('package.json', import.meta.url)).then(
        (res) => res.status
      ),
      200
    )

    // assets from a
    is(
      await fetch(new URL('a.json', import.meta.url)).then((res) => res.status),
      200
    )

    // assets from b
    is(
      await fetch(new URL('b.txt', import.meta.url)).then((res) => res.status),
      200
    )
  })
})
