import pdefer from 'p-defer'
import { equal, is, ok } from 'uvu/assert'
import * as Client from '../src/client'

it.skip('Array', () => {
  describe('#indexOf()', () => {
    it('should return -1 when the value is not present', () => {
      function add(a: number, b: number): number {
        return a + b
      }
      is(add(1, 1), 2)
    })
  })
})

it('should geolocation', async () => {
  if (Client.mode === 'main') {
    const deferred = pdefer()
    await Client.context.setGeolocation({
      latitude: 59.95,
      longitude: 30.31667,
    })
    await Client.context.grantPermissions(['geolocation'])

    navigator.geolocation.getCurrentPosition((position) => {
      deferred.resolve(position)
    })

    const position = (await deferred.promise) as GeolocationPosition
    equal(position.coords.latitude, 59.95)
  }
})
