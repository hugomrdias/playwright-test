'use strict'

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.pathname.endsWith('favicon.ico')) {
    const data = {
      env: process.env.PW_TEST,
      kv: KV,
    }
    event.respondWith(new Response(JSON.stringify(data)))
  }
})
