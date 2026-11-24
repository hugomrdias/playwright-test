import { strictEqual } from 'node:assert'

describe('test frame', () => {
  it('runs in the one iframe of the page, at the test page', () => {
    strictEqual(window.top === window, false)
    strictEqual(window.parent.document.querySelectorAll('iframe').length, 1)
    strictEqual(location.pathname, '/')
    strictEqual(
      new URL(location.href).searchParams.has('playwright-test'),
      true
    )
  })
})
