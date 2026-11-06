describe('localStorage', () => {
  it('is there for tests', () => {
    localStorage.setItem('key', 'value')
    if (localStorage.getItem('key') !== 'value') {
      throw new Error('localStorage is not working')
    }
  })
})
