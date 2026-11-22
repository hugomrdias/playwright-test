/** biome-ignore-all lint/suspicious/noConsole: test */
console.log(
  `before-env:${process.env.FLOW_ENV}:${process.env.FLOW_BEFORE}:${String(process.env.PW_SERVER).startsWith('http://127.0.0.1:')}`
)
globalThis.PW_TEST.beforeEnd()
