/* eslint-disable no-undef */
// eslint-disable-next-line strict
const { is, ok } = require('uvu/assert')
const debug = require('debug')('app')
const { good, bad } = require('./lib')

describe('Array', () => {
  describe('#indexOf()', () => {
    it('should return -1 when the value is not present', () => {
      console.log(process)
      is([1, 2, 3].indexOf(4), -1)
    })

    it('should fail  ', () => {
      is([1, 2, 3].indexOf(2), 1)
    })

    it('should pass with debug', () => {
      is([1, 2, 3].indexOf(4), -1)
      debug('test pass')
    })

    it('should return "good"', async () => {
      is(await good(), 'good')
    })

    it('should return "bad"', async () => {
      is(await bad(), 'bad')
    })

    it('should has import.meta', async () => {
      ok(import.meta.url)
    })
  })
})
