declare global {
  function pwContextSetOffline(offline: boolean): Promise<void>
  /**
   * Grants specified permissions to the browser context. Only grants corresponding permissions to the given origin if
   * specified.
   *
   * @param permissions A permission or an array of permissions to grant. Permissions can be one of the following values:
   * - `'geolocation'`
   * - `'midi'`
   * - `'midi-sysex'` (system-exclusive midi)
   * - `'notifications'`
   * - `'camera'`
   * - `'microphone'`
   * - `'background-sync'`
   * - `'ambient-light-sensor'`
   * - `'accelerometer'`
   * - `'gyroscope'`
   * - `'magnetometer'`
   * - `'accessibility-events'`
   * - `'clipboard-read'`
   * - `'clipboard-write'`
   * - `'payment-handler'`
   * @param options
   * @param options.origin
   */
  function pwContextGrantPermissions(
    permissions: string[],
    options?: {
      /**
       * The [origin] to grant permissions to, e.g. "https://example.com".
       */
      origin?: string
    }
  ): Promise<void>

  /**
   *
   * @param geolocation
   */
  function pwContextSetGeolocation(
    geolocation: null | {
      /**
       * Latitude between -90 and 90.
       */
      latitude: number

      /**
       * Longitude between -180 and 180.
       */
      longitude: number

      /**
       * Non-negative accuracy value. Defaults to `0`.
       */
      accuracy?: number
    }
  ): Promise<void>
}

export {}
