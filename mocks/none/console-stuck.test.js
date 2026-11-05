/** biome-ignore-all lint/suspicious/noConsole: its ok */

// The runner reading the argument never finishes, it should give up and exit.
// Firefox also reads it during console.log in workers, without this flag that call
// would never return and the test could never end.
let stuck = false
console.log('console-stuck', {
  get value() {
    while (stuck) {
      // never ends
    }
    return 1
  },
})
stuck = true

process.exit(0)
