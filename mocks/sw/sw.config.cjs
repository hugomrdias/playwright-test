const path = require('path')
module.exports = {
  buildSWConfig: {
    inject: [path.join(__dirname, 'sw-globals.js')],
  },
  afterTests: () => {
    console.log('AFTER')
  },
}
