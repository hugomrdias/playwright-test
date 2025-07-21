/* eslint-disable no-undef */
// eslint-disable-next-line strict
const { is, ok, equal } = require('uvu/assert')
const debug = require('debug')('app')
const { good, bad } = require('./lib')
const Client = require('../src/client')

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

    it('should has import.meta.url', () => {
      ok(import.meta.url)
    })

    it('should has import.meta.env', () => {
      equal(import.meta.env, process.env)
    })

    it('should has server', () => {
      equal(process.env.PW_SERVER, Client.server)
    })

    it('should setoffline', async () => {
      if (Client.mode === 'main' && Client.options.extension === false) {
        globalThis.addEventListener('offline', () => {
          // biome-ignore lint/suspicious/noConsoleLog: <explanation>
          console.log('offlineee')
        })
        // try {
        //   fetch('https://example.comeeee')
        // } catch (error) {}
        await Client.context.setOffline(true)
        equal(navigator.onLine, false)
        await Client.context.setOffline(false)
        equal(navigator.onLine, true)
      }
    })
  })
})
