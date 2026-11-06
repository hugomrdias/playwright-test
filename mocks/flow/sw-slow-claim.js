// Runs before the listener that claims the page, so the claim comes this late
const block = Number(process.env.FLOW_SW_BLOCK)
// biome-ignore lint/style/noRestrictedGlobals: a service worker has no window
self.addEventListener('activate', () => {
  const end = Date.now() + block
  while (Date.now() < end) {
    // Stay busy
  }
})
