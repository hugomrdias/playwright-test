/* eslint-disable no-undef */
// eslint-disable-next-line strict
import { is , ok } from 'uvu/assert'
import debug from 'debug'
import { good, bad } from './lib.js'

debug('app')


describe('Array', () => {
  describe('#indexOf()', () => {
    it('should return -1 when the value is not present', () => {
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
  })
})

describe('import.meta.url works', () => { 
  it('import.meta.url should be defined', () => {
    ok(import.meta.url)
  })
})