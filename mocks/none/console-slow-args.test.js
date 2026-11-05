/** biome-ignore-all lint/suspicious/noConsole: its ok */

// Reading the argument takes a while in the page, the run ends while the
// runner is still waiting for the values of these lines
const slow = {
  get value() {
    const end = Date.now() + 20
    while (Date.now() < end) {
      // busy wait
    }
    return 1
  },
}

for (let i = 0; i < 10; i++) {
  console.log(`console-slow-${i}`, slow)
}

process.exit(0)
