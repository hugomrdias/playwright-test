/** biome-ignore-all lint/suspicious/noConsole: test */
const server = (env) => String(env.PW_SERVER).startsWith('http://127.0.0.1:')
console.log(
  `env:${process.env.FLOW_ENV}:${process.env.FLOW_BEFORE}:${server(process.env)}`
)
console.log(
  `meta-env:${import.meta.env.FLOW_ENV}:${import.meta.env.FLOW_BEFORE}:${server(import.meta.env)}`
)
process.exit(0)
