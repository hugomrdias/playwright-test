import { strict as assert } from 'assert'
import * as Client from '../../src/client/index.ts'
import { test } from '../../src/node/test.ts'

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
  // Playwright keeps the unknown permission, the next grant would fail too
  await Client.context.clearPermissions()
})

test('setGeolocation', async () => {
  await Client.context.setGeolocation({ latitude: 59.95, longitude: 30.31667 })
})

test('clearPermissions', async (t) => {
  const query = async () =>
    (await navigator.permissions.query({ name: 'geolocation' })).state
  // WebKit on Windows has the Permissions API in workers, but query throws
  const supported = await query().then(
    () => true,
    () => false
  )
  if (!supported) {
    t.skip('no permissions.query for geolocation here')
    return
  }
  await Client.context.grantPermissions(['geolocation'])
  assert.equal(await query(), 'granted')
  await Client.context.clearPermissions()
  assert.notEqual(await query(), 'granted')
})

test('clearPermissions with nothing granted', async () => {
  await Client.context.clearPermissions()
})

test('setExtraHTTPHeaders', async () => {
  await Client.context.setExtraHTTPHeaders({ 'x-pw-test': 'yes' })
  assert.equal((await fetch(Client.server)).ok, true)
  await Client.context.setExtraHTTPHeaders({})
})

test('setExtraHTTPHeaders rejects with the error of Playwright', async () => {
  await assert.rejects(
    // @ts-expect-error not a string
    Client.context.setExtraHTTPHeaders({ 'x-pw-test': 1 }),
    { message: /x-pw-test/ }
  )
})

test('addCookies, cookies and clearCookies', async () => {
  await Client.context.addCookies([
    { name: 'pw-a', value: 'a', url: Client.server },
    { name: 'pw-b', value: 'b', url: Client.server },
  ])

  // The array of Playwright survives the trip back, also from the worker
  const cookies = await Client.context.cookies(Client.server)
  const names = cookies.map((c) => c.name).sort()
  assert.deepEqual(names, ['pw-a', 'pw-b'])
  const a = cookies.find((c) => c.name === 'pw-a')
  assert.equal(a?.value, 'a')
  assert.equal(a?.domain, new URL(Client.server).hostname)
  assert.equal(typeof a?.expires, 'number')

  // Not in the popup of --extension, its origin is another
  if (
    globalThis.document &&
    location.origin === new URL(Client.server).origin
  ) {
    assert.match(document.cookie, /pw-a=a/)
  }

  // A RegExp also makes it to Playwright
  await Client.context.clearCookies({ name: /^pw-a$/ })
  assert.deepEqual(
    (await Client.context.cookies()).map((c) => c.name),
    ['pw-b']
  )
  await Client.context.clearCookies()
  assert.deepEqual(await Client.context.cookies(), [])
})
