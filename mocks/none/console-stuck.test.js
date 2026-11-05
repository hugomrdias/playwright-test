/** biome-ignore-all lint/suspicious/noConsole: its ok */

// Reading the argument never finishes, the runner should give up and exit
console.log('console-stuck', {
  get value() {
    while (true) {
      // never ends
    }
  },
})

process.exit(0)
