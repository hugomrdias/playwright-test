/** biome-ignore-all lint/suspicious/noConsole: test */
const { active } = await navigator.serviceWorker.ready
navigator.serviceWorker.onmessage = ({ data }) => {
  console.log(`sw-env:${data}`)
  setTimeout(() => process.exit(0), 100)
}
active.postMessage('env')
