export const env = /** @type { import('../types.js').RunnerEnv} */ (
  /** @type { unknown } */ (process.env)
)

/**
 * Playwright Test options
 *
 * @type {import('../types.js').RunnerOptions}
 */
export const options = JSON.parse(env.PW_OPTIONS)

/**
 * Playwright Test mode
 */
export const mode = options.mode

/**
 * Playwright Test server url
 *
 * @type {string}
 */
export const server = env.PW_SERVER

/**
 * Playwright Test browser context
 *
 * Methods to interact with the browser context
 *
 */
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
