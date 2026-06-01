/** biome-ignore-all lint/suspicious/noConsole: its ok */
import { Bench } from 'tinybench'

const bench = new Bench({ time: 100 })

async function run() {
  bench
    .add('faster task', () => {
      console.log('I am faster')
    })
    .add('slower task', async () => {
      await new Promise((r) => setTimeout(r, 500)) // we wait 1ms :)
      console.log('I am slower')
    })

  await bench.run()
}

await run()

console.table(bench.table())

process.exit(0)
