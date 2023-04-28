import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default Promise.resolve({
  buildSWConfig: {
    inject: [path.join(__dirname, 'sw-globals.js')],
  },
  afterTests: () => {
    console.log('AFTER')
  },
})
