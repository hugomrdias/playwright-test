/** biome-ignore-all lint/suspicious/noConsole: test */
// The build never ends, the exit hook runs out of time waiting for it
export default {
  buildConfig: {
    plugins: [
      {
        name: 'stuck',
        setup(build) {
          build.onStart(() => {
            console.error('build-stuck')
            return new Promise(() => {
              // never settles
            })
          })
        },
      },
    ],
  },
}
