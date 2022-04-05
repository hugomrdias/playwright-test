const path = require('path')

export default async function ()  {
  return {
    buildSWConfig: {
      inject: [path.join(__dirname, 'sw-globals.js')],
    },
    afterTests: () => {
      console.log('AFTER')
    }
  }
}
