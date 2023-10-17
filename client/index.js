const config = /** @type { import('../src/types.js').RunnerOptions} */ (
  /** @type { unknown } */ (process.env.PW_TEST)
)

export const mode = config.mode

export const options = config

export const context = {
  /** @type {import('playwright-core').BrowserContext['setOffline']} */
  setOffline(offline) {
    if ('pwContextSetOffline' in globalThis === false) {
      return Promise.resolve()
    }
    return globalThis.pwContextSetOffline(offline)
  },

  /** @type {import('playwright-core').BrowserContext['grantPermissions']} */
  grantPermissions(permissions, options) {
    return globalThis.pwContextGrantPermissions(permissions, options)
  },

  /** @type {import('playwright-core').BrowserContext['setGeolocation']} */
  setGeolocation(geolocation) {
    return globalThis.pwContextSetGeolocation(geolocation)
  },
}
