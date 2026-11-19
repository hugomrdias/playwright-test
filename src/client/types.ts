import type { BrowserContext, Page } from 'playwright-core'

/**
 * Names of the browser context bindings of playwright-test/client
 */
export type ContextBinding =
  | 'pwContextSetOffline'
  | 'pwContextGrantPermissions'
  | 'pwContextClearPermissions'
  | 'pwContextSetGeolocation'
  | 'pwContextSetExtraHTTPHeaders'
  | 'pwContextAddCookies'
  | 'pwContextCookies'
  | 'pwContextClearCookies'

/**
 * Names of the page bindings of playwright-test/client, they act on the page
 * that calls them
 */
export type PageBinding =
  | 'pwPageClick'
  | 'pwPageKeyboardPress'
  | 'pwPageKeyboardType'

export type Binding = ContextBinding | PageBinding

/**
 * Trusted input on the test page, the subset of Playwright's `Page` that
 * playwright-test/client exposes
 */
export interface ClientPage {
  /**
   * Clicks the element that matches `selector` in the test page, see
   * [page.click](https://playwright.dev/docs/api/class-page#page-click).
   */
  click: Page['click']
  keyboard: {
    /**
     * Presses a key in the test page, see
     * [keyboard.press](https://playwright.dev/docs/api/class-keyboard#keyboard-press).
     */
    press: Page['keyboard']['press']
    /**
     * Types text in the focused element of the test page, see
     * [keyboard.type](https://playwright.dev/docs/api/class-keyboard#keyboard-type).
     */
    type: Page['keyboard']['type']
  }
}

declare global {
  function pwContextSetOffline(
    ...args: Parameters<BrowserContext['setOffline']>
  ): Promise<void>
  function pwContextGrantPermissions(
    ...args: Parameters<BrowserContext['grantPermissions']>
  ): Promise<void>
  function pwContextClearPermissions(
    ...args: Parameters<BrowserContext['clearPermissions']>
  ): Promise<void>
  function pwContextSetGeolocation(
    ...args: Parameters<BrowserContext['setGeolocation']>
  ): Promise<void>
  function pwContextSetExtraHTTPHeaders(
    ...args: Parameters<BrowserContext['setExtraHTTPHeaders']>
  ): Promise<void>
  function pwContextAddCookies(
    ...args: Parameters<BrowserContext['addCookies']>
  ): Promise<void>
  function pwContextCookies(
    ...args: Parameters<BrowserContext['cookies']>
  ): ReturnType<BrowserContext['cookies']>
  function pwContextClearCookies(
    ...args: Parameters<BrowserContext['clearCookies']>
  ): Promise<void>
  function pwPageClick(...args: Parameters<Page['click']>): Promise<void>
  function pwPageKeyboardPress(
    ...args: Parameters<Page['keyboard']['press']>
  ): Promise<void>
  function pwPageKeyboardType(
    ...args: Parameters<Page['keyboard']['type']>
  ): Promise<void>
}
