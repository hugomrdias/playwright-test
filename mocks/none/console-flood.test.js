/** biome-ignore-all lint/suspicious/noConsole: its ok */

// Logs a burst of lines then ends the run right away, the runner should print
// every line to stdout before closing the browser
for (let i = 0; i < 1000; i++) {
  console.log(`console-flood-${i}`)
}

process.exit(0)
