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
 * Call a browser context binding, from the page or the worker running the tests.
 *
 * @param {'pwContextSetOffline' | 'pwContextGrantPermissions' | 'pwContextSetGeolocation'} name
 * @param {unknown[]} args
 * @returns {Promise<void> | undefined} undefined when there's no browser context
 */
function callContext(name, args) {
  if (name in globalThis) {
    // @ts-expect-error the types of each binding are checked by its caller
    return globalThis[name](...args)
  }
  if (!inTestWorker) {
    return
  }
  // A port of its own, the messages of the tests to the worker stay theirs
  const { port1, port2 } = new MessageChannel()
  return new Promise((resolve, reject) => {
    port1.onmessage = ({ data }) => {
      port1.close()
      if ('error' in data) {
        reject(new Error(data.error))
      } else {
        resolve(data.value)
      }
    }
    postMessage({ pwContextCall: { name, args } }, { transfer: [port2] })
  })
}

/**
 * @param {string} method
 */
function unavailable(method) {
  return Promise.reject(
    new Error(`context.${method} needs a browser, it isn't available here.`)
  )
}

/**
 * Playwright Test browser context
 *
 * Methods to interact with the browser context
 *
 */
export const context = {
  /** @type {import('playwright-core').BrowserContext['setOffline']} */
  setOffline(offline) {
    return callContext('pwContextSetOffline', [offline]) ?? Promise.resolve()
  },

  /** @type {import('playwright-core').BrowserContext['grantPermissions']} */
  grantPermissions(permissions, options) {
    return (
      callContext('pwContextGrantPermissions', [permissions, options]) ??
      unavailable('grantPermissions')
    )
  },

  /** @type {import('playwright-core').BrowserContext['setGeolocation']} */
  setGeolocation(geolocation) {
    return (
      callContext('pwContextSetGeolocation', [geolocation]) ??
      unavailable('setGeolocation')
    )
  },
}
