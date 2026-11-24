// The next file reads it, the files of a page share its context like files share a disk
describe('storage 1', () => {
  it('writes localStorage', () => {
    localStorage.setItem('isolation', 'kept')
  })
})
