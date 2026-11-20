import assert from 'node:assert/strict'
import { it } from 'node:test'

it('gets files from the http server of the run', async () => {
  const response = await fetch(new URL('template.html', process.env.PW_SERVER))
  // Windows checkouts can end lines with \r\n
  assert.equal((await response.text()).trim(), '<p>template</p>')
})
