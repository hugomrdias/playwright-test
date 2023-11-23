'use strict'

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.pathname.endsWith('favicon.ico')) {
    const env = JSON.parse(process.env.PW_OPTIONS)
    const data = {
      env,
      kv: KV,
    }
    event.respondWith(new Response(JSON.stringify(data)))
  }
})
