import { strict as assert } from 'assert'
import * as Client from '../../src/client/index.ts'
import { test } from '../../src/node/test.ts'

test('setOffline does nothing without a browser', async () => {
  await Client.context.setOffline(true)
})

const calls = {
  'context.grantPermissions': () => Client.context.grantPermissions([]),
  'context.clearPermissions': () => Client.context.clearPermissions(),
  'context.setGeolocation': () => Client.context.setGeolocation(null),
  'context.setExtraHTTPHeaders': () => Client.context.setExtraHTTPHeaders({}),
  'context.addCookies': () => Client.context.addCookies([]),
  'context.cookies': () => Client.context.cookies(),
  'context.clearCookies': () => Client.context.clearCookies(),
  'page.click': () => Client.page.click('body'),
  'page.keyboard.press': () => Client.page.keyboard.press('Enter'),
  'page.keyboard.type': () => Client.page.keyboard.type('a'),
}

for (const [name, call] of Object.entries(calls)) {
  test(`${name} rejects without a browser`, async () => {
    await assert.rejects(call(), {
      message: `${name} needs a browser, it isn't available here.`,
    })
  })
}
