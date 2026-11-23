describe('storage 2', () => {
  it('reads what the file before wrote', () => {
    if (localStorage.getItem('isolation') !== 'kept') {
      throw new Error('localStorage was cleared')
    }
  })
})
