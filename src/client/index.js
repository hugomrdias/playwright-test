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

// The bindings only exist in pages, the worker running the tests asks the page
// that started it, see `addWorker`
const inTestWorker =
  mode === 'worker' && 'DedicatedWorkerGlobalScope' in globalThis

/**
 * Call a binding of the runner, from the page or the worker running the tests.
 *
 * @template {import('./types.js').Binding} N
 * @param {N} name
 * @param {Parameters<import('./types.js').ClientBindings[N]>} args
 * @returns {ReturnType<import('./types.js').ClientBindings[N]> | undefined} undefined when there's no browser
 */
function callBinding(name, args) {
  if ('pwClientCall' in globalThis) {
    return globalThis.pwClientCall(name, ...args)
  }
  if (!inTestWorker) {
    return
  }
  // A port of its own, the messages of the tests to the worker stay theirs
  const { port1, port2 } = new MessageChannel()
  return /** @type {ReturnType<import('./types.js').ClientBindings[N]>} */ (
    new Promise((resolve, reject) => {
      port1.onmessage = ({ data }) => {
        port1.close()
        if ('error' in data) {
          reject(new Error(data.error))
        } else {
          resolve(data.value)
        }
      }
      postMessage({ pwBindingCall: { name, args } }, { transfer: [port2] })
    })
  )
}

/**
 * @param {string} method
 * @returns {Promise<never>}
 */
function unavailable(method) {
  return Promise.reject(
    new Error(`${method} needs a browser, it isn't available here.`)
  )
}

/**
 * @typedef {import('playwright-core').BrowserContext} BrowserContext
 */

/**
 * Playwright Test browser context
 *
 * Methods to interact with the browser context
 *
 */
export const context = {
  /** @type {BrowserContext['setOffline']} */
  setOffline(offline) {
    return callBinding('pwContextSetOffline', [offline]) ?? Promise.resolve()
  },

  /** @type {BrowserContext['grantPermissions']} */
  grantPermissions(permissions, options) {
    return (
      callBinding('pwContextGrantPermissions', [permissions, options]) ??
      unavailable('context.grantPermissions')
    )
  },

  /** @type {BrowserContext['clearPermissions']} */
  clearPermissions() {
    return (
      callBinding('pwContextClearPermissions', []) ??
      unavailable('context.clearPermissions')
    )
  },

  /** @type {BrowserContext['setGeolocation']} */
  setGeolocation(geolocation) {
    return (
      callBinding('pwContextSetGeolocation', [geolocation]) ??
      unavailable('context.setGeolocation')
    )
  },

  /** @type {BrowserContext['setExtraHTTPHeaders']} */
  setExtraHTTPHeaders(headers) {
    return (
      callBinding('pwContextSetExtraHTTPHeaders', [headers]) ??
      unavailable('context.setExtraHTTPHeaders')
    )
  },

  /** @type {BrowserContext['addCookies']} */
  addCookies(cookies) {
    return (
      callBinding('pwContextAddCookies', [cookies]) ??
      unavailable('context.addCookies')
    )
  },

  /** @type {BrowserContext['cookies']} */
  cookies(urls) {
    return (
      callBinding('pwContextCookies', [urls]) ?? unavailable('context.cookies')
    )
  },

  /** @type {BrowserContext['clearCookies']} */
  clearCookies(options) {
    return (
      callBinding('pwContextClearCookies', [options]) ??
      unavailable('context.clearCookies')
    )
  },
}

/**
 * Playwright Test page
 *
 * Trusted input on the test page, what user activation needs. With `--mode
 * worker` it still goes to the page that started the worker.
 *
 * @type {import('./types.js').ClientPage}
 */
export const page = {
  click(selector, options) {
    return (
      callBinding('pwPageClick', [selector, options]) ??
      unavailable('page.click')
    )
  },

  keyboard: {
    press(key, options) {
      return (
        callBinding('pwPageKeyboardPress', [key, options]) ??
        unavailable('page.keyboard.press')
      )
    },

    type(text, options) {
      return (
        callBinding('pwPageKeyboardType', [text, options]) ??
        unavailable('page.keyboard.type')
      )
    },
  },
}
