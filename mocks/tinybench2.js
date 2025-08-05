import { Bench } from 'tinybench'

const bench = new Bench({ time: 100 })

async function run() {
  bench
    .add('faster task', () => {
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      console.log('I am faster')
    })
    .add('slower task', async () => {
      await new Promise((r) => setTimeout(r, 500)) // we wait 1ms :)
      // biome-ignore lint/suspicious/noConsoleLog: <explanation>
      console.log('I am slower')
    })

  await bench.run()
}

await run()

console.table(
  bench.tasks.map(({ name, result }) => ({
    'Task Name': name,
    'Average Time (ps)': result?.mean * 1000,
    'Variance (ps)': result?.variance * 1000,
  }))
)

process.exit(0)
