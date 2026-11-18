import { strict as assert } from 'assert'
import * as Client from '../../src/client/index.js'
import { test } from '../../src/node/test.js'

test('setOffline', async () => {
  await Client.context.setOffline(true)
  await assert.rejects(fetch(Client.server))
  await Client.context.setOffline(false)
  assert.equal((await fetch(Client.server)).ok, true)
})

test('grantPermissions', async () => {
  await Client.context.grantPermissions(['geolocation'])
})

test('grantPermissions rejects with the error of Playwright', async () => {
  await assert.rejects(Client.context.grantPermissions(['not-a-permission']), {
    message: /not-a-permission/,
  })
})

test('setGeolocation', async () => {
  await Client.context.setGeolocation({ latitude: 59.95, longitude: 30.31667 })
})
