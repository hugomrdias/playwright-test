// An app shell for every page it controls, like a single page app
globalThis.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      new Response('<base href="/app/"><p>app shell</p>', {
        headers: { 'content-type': 'text/html' },
      })
    )
  }
})
