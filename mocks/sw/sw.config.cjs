const path = require('path')
module.exports = {
  buildSWConfig: {
    inject: [path.join(__dirname, 'sw-globals.js')],
  },
  afterTests: () => {
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    console.log('AFTER')
  },
}
