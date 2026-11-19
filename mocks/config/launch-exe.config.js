import { chromium } from 'playwright-core'

// The whole Chromium instead of the headless shell, nothing to download for it
export default {
  launchOptions: { executablePath: chromium.executablePath() },
}
