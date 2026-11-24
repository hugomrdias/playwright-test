// The next file reads it, the run shares one origin like files share a disk
describe('storage 1', () => {
  it('writes localStorage', () => {
    localStorage.setItem('isolation', 'kept')
  })
})
