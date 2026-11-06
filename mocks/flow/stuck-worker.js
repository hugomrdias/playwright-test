/** biome-ignore-all lint/suspicious/noConsole: test */
// The read of what it logs never gets an answer, its thread is stuck
const source = `console.log({ from: 'worker' })
while (true) {}`
new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })))

let count = 0
const interval = setInterval(() => {
  console.log(`page-${++count}`)
  if (count === 3) {
    clearInterval(interval)
    process.exit(0)
  }
}, 200)
