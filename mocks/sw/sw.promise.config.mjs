const path = require('path')

export default Promise.resolve({
  buildSWConfig: {
    inject: [path.join(__dirname, 'sw-globals.js')],
  },
  afterTests: () => {
    console.log('AFTER')
  }
})
