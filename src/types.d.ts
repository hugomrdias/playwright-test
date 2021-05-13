import type { BuildOptions } from 'esbuild'
import type {
  ChromiumBrowser,
  FirefoxBrowser,
  WebKitBrowser,
} from 'playwright-core'

export interface RunnerOptions {
  cwd: string
  assets: string
  browser: 'chromium' | 'firefox' | 'webkit'
  debug: boolean
  mode: 'main' | 'worker'
  incognito: boolean
  input?: string[]
  extension: boolean
  runnerOptions: any
  before?: string
  sw?: string
  cov: false
  extensions: string
  buildConfig: BuildOptions
  buildSWConfig: BuildOptions
}

export type PwResult<TBrowser> = TBrowser extends 'webkit'
  ? WebKitBrowser
  : TBrowser extends 'firefox'
  ? FirefoxBrowser
  : TBrowser extends 'chromium'
  ? ChromiumBrowser
  : never
