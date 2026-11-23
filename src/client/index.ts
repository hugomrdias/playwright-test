import type { BrowserContext } from 'playwright-core'
import type { RunnerEnv, RunnerOptions } from '../types.ts'
import type { Binding, ClientBindings, ClientPage } from './types.ts'

export type { BrowserContext } from 'playwright-core'
export const env = process.env as RunnerEnv

/**
 * Playwright Test options
 */
export const options: RunnerOptions = JSON.parse(env.PW_OPTIONS)

/**
 * Playwright Test mode
 */
export const mode = options.mode

/**
 * Playwright Test server url
 */
export const server: string = env.PW_SERVER

// The bindings only exist in pages, the worker running the tests asks the page
// that started it, see `addWorker`
const inTestWorker =
  mode === 'web-worker' && 'DedicatedWorkerGlobalScope' in globalThis

/**
 * Call a binding of the runner, from the page or the worker running the tests.
 *
 * @returns undefined when there's no browser
 */
function callBinding<N extends Binding>(
  name: N,
  args: Parameters<ClientBindings[N]>
): ReturnType<ClientBindings[N]> | undefined {
  if ('pwClientCall' in globalThis) {
    return globalThis.pwClientCall(name, ...args)
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
    postMessage({ pwBindingCall: { name, args } }, { transfer: [port2] })
  }) as ReturnType<ClientBindings[N]>
}

function unavailable(method: string): Promise<never> {
  return Promise.reject(
    new Error(`${method} needs a browser, it isn't available here.`)
  )
}

/**
 * Playwright Test browser context
 *
 * Methods to interact with the browser context
 *
 */
export const context: Pick<
  BrowserContext,
  | 'setOffline'
  | 'grantPermissions'
  | 'clearPermissions'
  | 'setGeolocation'
  | 'setExtraHTTPHeaders'
  | 'addCookies'
  | 'cookies'
  | 'clearCookies'
> = {
  setOffline(offline) {
    return callBinding('pwContextSetOffline', [offline]) ?? Promise.resolve()
  },

  grantPermissions(permissions, options) {
    return (
      callBinding('pwContextGrantPermissions', [permissions, options]) ??
      unavailable('context.grantPermissions')
    )
  },

  clearPermissions() {
    return (
      callBinding('pwContextClearPermissions', []) ??
      unavailable('context.clearPermissions')
    )
  },

  setGeolocation(geolocation) {
    return (
      callBinding('pwContextSetGeolocation', [geolocation]) ??
      unavailable('context.setGeolocation')
    )
  },

  setExtraHTTPHeaders(headers) {
    return (
      callBinding('pwContextSetExtraHTTPHeaders', [headers]) ??
      unavailable('context.setExtraHTTPHeaders')
    )
  },

  addCookies(cookies) {
    return (
      callBinding('pwContextAddCookies', [cookies]) ??
      unavailable('context.addCookies')
    )
  },

  cookies(urls) {
    return (
      callBinding('pwContextCookies', [urls]) ?? unavailable('context.cookies')
    )
  },

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
 * web-worker` it still goes to the page that started the worker.
 */
export const page: ClientPage = {
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
