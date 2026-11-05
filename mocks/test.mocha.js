import createDebug from 'debug'
import { equal, is, ok } from 'uvu/assert'
import * as Client from '../src/client/index.js'
import { bad, good } from './lib.js'

const debug = createDebug('app')

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
          // biome-ignore lint/suspicious/noConsole: reason
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
