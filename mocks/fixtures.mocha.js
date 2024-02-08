const { equal } = require('uvu/assert')

describe('fixtures', () => {
  it('should load a gzipped tar file', async () => {
    const resp = await fetch('mocks/fixtures/file.tar.gz')
    const buf = await resp.arrayBuffer()
    const ui8 = new Uint8Array(buf)
    const base64 = btoa(String.fromCodePoint(...ui8))

    equal(base64, 'H4sICIlTHVIACw==')
  })
})
