import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
  buildSWConfig: {
    inject: [path.join(__dirname, 'sw-globals.js')],
  },
  afterTests: () => {
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    console.log('AFTER')
  },
}
