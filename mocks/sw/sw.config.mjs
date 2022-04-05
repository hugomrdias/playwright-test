const path = require('path')

export default {
  buildSWConfig: {
    inject: [path.join(__dirname, 'sw-globals.js')],
  },
  afterTests: () => {
    console.log('AFTER')
  }
}
